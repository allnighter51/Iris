//! Vault commands: import / edit / delete assets, folders, persisted in
//! `vault_manifest.json` next to the managed `vault_assets/` directory.

use crate::model::*;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    sync::atomic::Ordering,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    ipc::{InvokeBody, Request},
    State,
};

const MAX_ASSET_BYTES: usize = 50 * 1024 * 1024;
const MAX_THUMB_BYTES: usize = 5 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultPayload {
    items: Vec<VaultItem>,
    folders: Vec<String>,
    presets: Vec<CompositePreset>,
    root_dir: String,
    assets_dir: String,
    thumbs_dir: String,
}

fn snapshot(st: &AppState) -> VaultPayload {
    let m = st.manifest();
    VaultPayload {
        items: m.items.clone(),
        folders: m.folders.clone(),
        presets: m.presets.clone(),
        root_dir: st.root.to_string_lossy().into(),
        assets_dir: st.assets_dir().to_string_lossy().into(),
        thumbs_dir: st.thumbs_dir().to_string_lossy().into(),
    }
}

fn persist(st: &AppState) -> Result<(), String> {
    let m = st.manifest();
    write_json_atomic(&st.manifest_path(), &*m)
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Some(v) = std::str::from_utf8(&b[i + 1..i + 3])
                .ok()
                .and_then(|h| u8::from_str_radix(h, 16).ok())
            {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn header(req: &Request<'_>, key: &str) -> String {
    req.headers()
        .get(key)
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .unwrap_or_default()
}

fn raw_body<'a>(req: &'a Request<'_>, max_len: usize) -> Result<&'a Vec<u8>, String> {
    match req.body() {
        InvokeBody::Raw(b) if !b.is_empty() && b.len() <= max_len => Ok(b),
        InvokeBody::Raw(_) => Err("payload size out of bounds".into()),
        _ => Err("expected raw binary body".into()),
    }
}

fn is_valid_image(bytes: &[u8]) -> (bool, bool) {
    let is_png = bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);
    let is_webp = bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP";
    (is_png, is_webp)
}

fn new_id(st: &AppState) -> String {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!("{:x}{:x}", nanos, st.counter.fetch_add(1, Ordering::Relaxed))
}

#[tauri::command]
pub fn vault_load(state: State<AppState>) -> VaultPayload {
    snapshot(&state)
}

#[tauri::command]
pub fn import_asset(state: State<AppState>, request: Request<'_>) -> Result<VaultItem, String> {
    let bytes = raw_body(&request, MAX_ASSET_BYTES)?;
    let (is_png, is_webp) = is_valid_image(bytes);
    if !is_png && !is_webp {
        return Err("Only PNG and WebP images are supported".into());
    }
    let game = sanitize_text(&header(&request, "x-game"), 60);
    if game.is_empty() {
        return Err("A game category is required".into());
    }
    let id = new_id(&state);
    let file = format!("{}.{}", id, if is_png { "png" } else { "webp" });
    fs::write(state.assets_dir().join(&file), bytes).map_err(|e| e.to_string())?;

    let name = sanitize_text(&header(&request, "x-name"), 120);
    let folder = sanitize_text(&header(&request, "x-folder"), 60);
    let tag = sanitize_text(&header(&request, "x-tag"), 32);
    let item = VaultItem {
        id,
        name: if name.is_empty() { "Untitled".into() } else { name },
        game,
        folder: (!folder.is_empty()).then_some(folder),
        file,
        thumb: None,
        width: header(&request, "x-width").parse().unwrap_or(0),
        height: header(&request, "x-height").parse().unwrap_or(0),
        created_at: SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0),
        transform: None,
        tag: (!tag.is_empty()).then_some(tag),
        favorite: header(&request, "x-favorite") == "true",
    };
    state.manifest().items.push(item.clone());
    persist(&state)?;
    Ok(item)
}

#[tauri::command]
pub fn save_thumbnail(state: State<AppState>, request: Request<'_>) -> Result<VaultPayload, String> {
    let bytes = raw_body(&request, MAX_THUMB_BYTES)?;
    let (is_png, _) = is_valid_image(bytes);
    if !is_png {
        return Err("Invalid thumbnail format".into());
    }
    let id = header(&request, "x-id");
    if !is_safe_id(&id) {
        return Err("Invalid item id".into());
    }
    let thumb = format!("{id}.png");
    // Verify item exists prior to disk write
    {
        let m = state.manifest();
        if !m.items.iter().any(|i| i.id == id) {
            return Err("unknown item".into());
        }
    }
    // Perform disk I/O without holding the manifest lock
    let thumb_path = state.thumbs_dir().join(&thumb);
    fs::write(&thumb_path, bytes).map_err(|e| e.to_string())?;
    {
        let mut m = state.manifest();
        let item = m.items.iter_mut().find(|i| i.id == id).ok_or("unknown item")?;
        item.thumb = Some(thumb);
    }
    persist(&state)?;
    Ok(snapshot(&state))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemPatch {
    name: Option<String>,
    game: Option<String>,
    folder: Option<String>,
    transform: Option<Transform>,
    tag: Option<String>,
    favorite: Option<bool>,
}

#[tauri::command]
pub fn vault_update_item(state: State<AppState>, id: String, patch: ItemPatch) -> Result<VaultPayload, String> {
    if !is_safe_id(&id) {
        return Err("Invalid item id".into());
    }
    {
        let mut m = state.manifest();
        let item = m.items.iter_mut().find(|i| i.id == id).ok_or("unknown item")?;
        if let Some(n) = patch.name.map(|n| sanitize_text(&n, 120)).filter(|n| !n.is_empty()) {
            item.name = n;
        }
        if let Some(g) = patch.game.map(|g| sanitize_text(&g, 60)).filter(|g| !g.is_empty()) {
            item.game = g;
        }
        if let Some(f) = patch.folder {
            let s = sanitize_text(&f, 60);
            item.folder = (!s.is_empty()).then_some(s);
        }
        if let Some(t) = patch.transform {
            item.transform = Some(t);
        }
        if let Some(t) = patch.tag {
            let s = sanitize_text(&t, 32);
            item.tag = (!s.is_empty()).then_some(s);
        }
        if let Some(fav) = patch.favorite {
            item.favorite = fav;
        }
    }
    persist(&state)?;
    Ok(snapshot(&state))
}

#[tauri::command]
pub fn vault_delete_item(state: State<AppState>, id: String) -> Result<VaultPayload, String> {
    if !is_safe_id(&id) {
        return Err("Invalid item id".into());
    }
    {
        let mut m = state.manifest();
        if let Some(pos) = m.items.iter().position(|i| i.id == id) {
            let item = m.items.remove(pos);
            if !item.file.contains("..") && !item.file.contains('/') && !item.file.contains('\\') {
                let _ = fs::remove_file(state.assets_dir().join(&item.file));
            }
            if let Some(t) = item.thumb {
                if !t.contains("..") && !t.contains('/') && !t.contains('\\') {
                    let _ = fs::remove_file(state.thumbs_dir().join(t));
                }
            }
        }
        // Prune any layers referencing this deleted asset from saved presets
        for preset in &mut m.presets {
            preset.layers.retain(|l| l.vault_item_id != id);
        }
    }
    persist(&state)?;
    Ok(snapshot(&state))
}

#[tauri::command]
pub fn vault_create_folder(state: State<AppState>, name: String) -> Result<VaultPayload, String> {
    let name = sanitize_text(&name, 60);
    if name.is_empty() {
        return Err("Folder name is empty".into());
    }
    {
        let mut m = state.manifest();
        if m.folders.len() >= 64 {
            return Err("Maximum folder limit reached".into());
        }
        if m.folders.iter().any(|f| f.eq_ignore_ascii_case(&name)) {
            return Err("Folder already exists".into());
        }
        m.folders.push(name);
    }
    persist(&state)?;
    Ok(snapshot(&state))
}

#[tauri::command]
pub fn vault_delete_folder(state: State<AppState>, name: String) -> Result<VaultPayload, String> {
    {
        let mut m = state.manifest();
        m.folders.retain(|f| f != &name);
        for i in m.items.iter_mut().filter(|i| i.folder.as_deref() == Some(name.as_str())) {
            i.folder = None;
        }
    }
    persist(&state)?;
    Ok(snapshot(&state))
}

#[tauri::command]
pub fn open_vault_dir(state: State<AppState>) {
    let _ = std::process::Command::new("explorer").arg(&state.root).spawn();
}

#[tauri::command]
pub fn preset_save(state: State<AppState>, mut preset: CompositePreset) -> Result<VaultPayload, String> {
    if !is_safe_id(&preset.id) {
        preset.id = new_id(&state);
    }
    preset.name = sanitize_text(&preset.name, 120);
    if preset.name.is_empty() {
        return Err("Preset name is required".into());
    }
    preset.layers.truncate(64);
    {
        let mut m = state.manifest();
        match m.presets.iter_mut().find(|p| p.id == preset.id) {
            Some(p) => *p = preset,
            None => m.presets.push(preset),
        }
    }
    persist(&state)?;
    Ok(snapshot(&state))
}

#[tauri::command]
pub fn preset_delete(state: State<AppState>, id: String) -> Result<VaultPayload, String> {
    state.manifest().presets.retain(|p| p.id != id);
    persist(&state)?;
    Ok(snapshot(&state))
}
