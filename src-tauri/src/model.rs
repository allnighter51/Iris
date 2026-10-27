//! Shared data model + persistence helpers (vault_manifest.json, settings.json).

use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64},
        Mutex,
    },
};

pub const IDENTIFIER: &str = "art.veevisuals.iris";

/// `%APPDATA%\art.veevisuals.iris` - identical to Tauri's `app_data_dir`, but
/// resolvable before the app is built (needed for early WebView2 flags).
pub fn default_root() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join(IDENTIFIER)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Transform {
    pub x: f64,
    pub y: f64,
    /// percent, 100 = native pixel match
    pub scale: f64,
    /// percent
    pub opacity: f64,
    /// degrees
    pub hue: f64,
    /// percent
    pub brightness: f64,
    /// percent
    pub contrast: f64,
    /// continuous animated rainbow hue-shift
    pub chroma_cycle: bool,
    /// cycle duration in seconds (e.g. 6.0)
    pub chroma_speed: f64,
}

impl Default for Transform {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            scale: 100.0,
            opacity: 100.0,
            hue: 0.0,
            brightness: 100.0,
            contrast: 100.0,
            chroma_cycle: false,
            chroma_speed: 6.0,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VaultItem {
    pub id: String,
    pub name: String,
    pub game: String,
    pub folder: Option<String>,
    pub file: String,
    pub thumb: Option<String>,
    pub width: u32,
    pub height: u32,
    pub created_at: u64,
    pub transform: Option<Transform>,
    /// element tag: "ult" | "map" | "health" | "hud" | "reticle"
    #[serde(default)]
    pub tag: Option<String>,
    #[serde(default)]
    pub favorite: bool,
}

/// One modular element inside a composite stack.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PresetLayer {
    pub id: String,
    pub vault_item_id: String,
    pub name: String,
    /// "base" | "ult" | "map" | "ability" | "crosshair" | "custom"
    pub role: String,
    /// higher = rendered in front
    pub z_index: i32,
    pub visible: bool,
    pub locked: bool,
    pub x: f64,
    pub y: f64,
    pub scale: f64,
    pub opacity: f64,
    pub hue: f64,
    /// non-destructive crop / flip / blend / link-group
    #[serde(default)]
    pub fx: LayerFx,
}

/// Non-destructive "Photoshop-style" layer effects.
/// Crop values are percentages of the source image trimmed from each edge.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct LayerFx {
    pub crop_t: f64,
    pub crop_r: f64,
    pub crop_b: f64,
    pub crop_l: f64,
    pub flip_x: bool,
    pub flip_y: bool,
    /// "" / "normal" | "screen" | "color-dodge" | "overlay" | "soft-light" | "lighten" | "multiply"
    pub blend: String,
    /// layers sharing a group id move together
    pub group: Option<String>,
}

/// A saved multi-layer "Loadout".
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CompositePreset {
    pub id: String,
    pub name: String,
    pub game: Option<String>,
    pub layers: Vec<PresetLayer>,
    /// monitor size the stack was authored on (thumbnail aspect)
    pub ref_w: u32,
    pub ref_h: u32,
    /// shown in the Vault tab with a STACK badge
    pub in_vault: bool,
    pub created_at: u64,
}

/// Resolved, ready-to-draw layer pushed to the overlay window.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SceneLayer {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub transform: Transform,
    #[serde(default)]
    pub fx: LayerFx,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct Manifest {
    pub version: u32,
    pub items: Vec<VaultItem>,
    pub folders: Vec<String>,
    pub presets: Vec<CompositePreset>,
}

impl Default for Manifest {
    fn default() -> Self {
        Self { version: 1, items: vec![], folders: vec![], presets: vec![] }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub hotkey_toggle: String,
    pub hotkey_next: String,
    pub hotkey_prev: String,
    /// true => WDA_EXCLUDEFROMCAPTURE (invisible to OBS / screenshots)
    pub hide_from_capture: bool,
    /// "topmost" | "game"
    pub target_mode: String,
    pub target_exe: String,
    pub auto_game_switch: bool,
    pub auto_hide_unfocused: bool,
    pub game_profiles: HashMap<String, String>,
    pub start_with_windows: bool,
    pub close_to_tray: bool,
    pub hardware_acceleration: bool,
    pub low_resource: bool,
    /// layer role -> global toggle hotkey
    pub layer_hotkeys: HashMap<String, String>,
    pub check_updates_on_startup: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            hotkey_toggle: "F10".into(),
            hotkey_next: "Ctrl+Alt+Right".into(),
            hotkey_prev: "Ctrl+Alt+Left".into(),
            hide_from_capture: false,
            target_mode: "topmost".into(),
            target_exe: "Overwatch.exe".into(),
            auto_game_switch: true,
            auto_hide_unfocused: false,
            game_profiles: HashMap::new(),
            start_with_windows: false,
            close_to_tray: false,
            hardware_acceleration: true,
            low_resource: false,
            layer_hotkeys: HashMap::new(),
            check_updates_on_startup: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct OverlayState {
    pub enabled: bool,
    pub item_id: Option<String>,
    /// absolute path of the PNG/WebP in vault_assets
    pub path: Option<String>,
    pub width: u32,
    pub height: u32,
    pub transform: Transform,
    pub monitor: usize,
    /// when non-empty, the composite stack is drawn instead of `path`
    pub scene: Vec<SceneLayer>,
}

impl OverlayState {
    pub fn has_content(&self) -> bool {
        self.path.is_some() || !self.scene.is_empty()
    }
}

pub struct AppState {
    pub root: PathBuf,
    pub manifest: Mutex<Manifest>,
    pub settings: Mutex<Settings>,
    pub overlay: Mutex<OverlayState>,
    pub game_running: AtomicBool,
    pub last_rect: Mutex<Option<(i32, i32, i32, i32)>>,
    pub counter: AtomicU64,
}

impl AppState {
    pub fn new(root: PathBuf, settings: Settings) -> Self {
        let _ = fs::create_dir_all(root.join("vault_assets"));
        let _ = fs::create_dir_all(root.join("vault_thumbs"));
        let manifest: Manifest = read_json(&root.join("vault_manifest.json")).unwrap_or_default();
        Self {
            root,
            manifest: Mutex::new(manifest),
            settings: Mutex::new(settings),
            overlay: Mutex::new(OverlayState::default()),
            game_running: AtomicBool::new(false),
            last_rect: Mutex::new(None),
            counter: AtomicU64::new(0),
        }
    }
    pub fn assets_dir(&self) -> PathBuf { self.root.join("vault_assets") }
    pub fn thumbs_dir(&self) -> PathBuf { self.root.join("vault_thumbs") }
    pub fn manifest_path(&self) -> PathBuf { self.root.join("vault_manifest.json") }
    pub fn settings_path(&self) -> PathBuf { self.root.join("settings.json") }
}

pub fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

/// Write via temp file + rename so a crash never leaves a half-written manifest.
pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let data = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}
