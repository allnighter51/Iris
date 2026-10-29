//! Shared data model + persistence helpers (vault_manifest.json, settings.json).

use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64},
        Mutex, MutexGuard,
    },
};

pub const IDENTIFIER: &str = "art.veevisuals.iris";
pub const KNOWN_ROLES: &[&str] = &["base", "ult", "map", "ability", "crosshair", "custom"];

pub fn default_root() -> PathBuf {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join(IDENTIFIER)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Transform {
    pub x: f64,
    pub y: f64,
    pub scale: f64,
    pub opacity: f64,
    pub hue: f64,
    pub brightness: f64,
    pub contrast: f64,
    pub chroma_cycle: bool,
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
    #[serde(default)]
    pub tag: Option<String>,
    #[serde(default)]
    pub favorite: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PresetLayer {
    pub id: String,
    pub vault_item_id: String,
    pub name: String,
    pub role: String,
    pub z_index: i32,
    pub visible: bool,
    pub locked: bool,
    pub x: f64,
    pub y: f64,
    pub scale: f64,
    pub opacity: f64,
    pub hue: f64,
    #[serde(default)]
    pub fx: LayerFx,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct LayerFx {
    pub crop_t: f64,
    pub crop_r: f64,
    pub crop_b: f64,
    pub crop_l: f64,
    pub flip_x: bool,
    pub flip_y: bool,
    pub blend: String,
    pub group: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CompositePreset {
    pub id: String,
    pub name: String,
    pub game: Option<String>,
    pub layers: Vec<PresetLayer>,
    pub ref_w: u32,
    pub ref_h: u32,
    pub in_vault: bool,
    pub created_at: u64,
}

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

fn default_true() -> bool {
    true
}

fn default_target_monitor_mode() -> String {
    "manual".into()
}

fn default_aspect_scaling_mode() -> String {
    "contain-16-9".into()
}

fn default_watcher_poll_ms() -> u64 {
    500
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub hotkey_toggle: String,
    pub hotkey_next: String,
    pub hotkey_prev: String,
    pub hide_from_capture: bool,
    pub target_mode: String,
    pub target_exe: String,
    pub auto_game_switch: bool,
    pub auto_hide_unfocused: bool,
    pub game_profiles: HashMap<String, String>,
    pub start_with_windows: bool,
    pub close_to_tray: bool,
    pub hardware_acceleration: bool,
    pub low_resource: bool,
    pub layer_hotkeys: HashMap<String, String>,
    pub check_updates_on_startup: bool,
    #[serde(default = "default_true")]
    pub telemetry_enabled: bool,
    #[serde(default = "default_target_monitor_mode")]
    pub target_monitor_mode: String,
    #[serde(default = "default_aspect_scaling_mode")]
    pub aspect_scaling_mode: String,
    #[serde(default = "default_watcher_poll_ms")]
    pub watcher_poll_ms: u64,
    #[serde(default)]
    pub custom_target_exes: Vec<String>,
    #[serde(default = "default_true")]
    pub smart_detect_all: bool,
    #[serde(default)]
    pub enabled_game_ids: Vec<String>,
}

impl Settings {
    pub fn is_smart_detect(&self) -> bool {
        self.target_mode == "game" || self.target_mode == "smart_detect"
    }
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
            telemetry_enabled: true,
            target_monitor_mode: "manual".into(),
            aspect_scaling_mode: "contain-16-9".into(),
            watcher_poll_ms: 500,
            custom_target_exes: Vec::new(),
            smart_detect_all: true,
            enabled_game_ids: Vec::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct OverlayState {
    pub enabled: bool,
    pub item_id: Option<String>,
    pub path: Option<String>,
    pub width: u32,
    pub height: u32,
    pub transform: Transform,
    pub monitor: usize,
    pub scene: Vec<SceneLayer>,
}

impl OverlayState {
    pub fn has_content(&self) -> bool {
        self.path.is_some() || !self.scene.is_empty()
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FseStatus {
    pub is_fse: bool,
    pub game_exe: Option<String>,
}

pub struct AppState {
    pub root: PathBuf,
    pub manifest: Mutex<Manifest>,
    pub settings: Mutex<Settings>,
    pub overlay: Mutex<OverlayState>,
    pub game_running: AtomicBool,
    pub last_rect: Mutex<Option<(i32, i32, i32, i32)>>,
    pub fse_status: Mutex<FseStatus>,
    pub active_game_title: Mutex<Option<String>>,
    pub active_game_exe: Mutex<Option<String>>,
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
            fse_status: Mutex::new(FseStatus::default()),
            active_game_title: Mutex::new(None),
            active_game_exe: Mutex::new(None),
            counter: AtomicU64::new(0),
        }
    }

    pub fn manifest(&self) -> MutexGuard<'_, Manifest> {
        self.manifest.lock().unwrap_or_else(|e| e.into_inner())
    }
    pub fn settings(&self) -> MutexGuard<'_, Settings> {
        self.settings.lock().unwrap_or_else(|e| e.into_inner())
    }
    pub fn overlay(&self) -> MutexGuard<'_, OverlayState> {
        self.overlay.lock().unwrap_or_else(|e| e.into_inner())
    }
    pub fn last_rect(&self) -> MutexGuard<'_, Option<(i32, i32, i32, i32)>> {
        self.last_rect.lock().unwrap_or_else(|e| e.into_inner())
    }
    pub fn fse_status(&self) -> MutexGuard<'_, FseStatus> {
        self.fse_status.lock().unwrap_or_else(|e| e.into_inner())
    }
    pub fn active_game(&self) -> (Option<String>, Option<String>) {
        (
            self.active_game_title.lock().unwrap_or_else(|e| e.into_inner()).clone(),
            self.active_game_exe.lock().unwrap_or_else(|e| e.into_inner()).clone(),
        )
    }
    pub fn set_active_game(&self, title: Option<String>, exe: Option<String>) {
        *self.active_game_title.lock().unwrap_or_else(|e| e.into_inner()) = title;
        *self.active_game_exe.lock().unwrap_or_else(|e| e.into_inner()) = exe;
    }

    pub fn assets_dir(&self) -> PathBuf { self.root.join("vault_assets") }
    pub fn thumbs_dir(&self) -> PathBuf { self.root.join("vault_thumbs") }
    pub fn manifest_path(&self) -> PathBuf { self.root.join("vault_manifest.json") }
    pub fn settings_path(&self) -> PathBuf { self.root.join("settings.json") }

    pub fn is_valid_asset_path(&self, path_str: &str) -> bool {
        if path_str.is_empty() || path_str.contains("..") || path_str.contains('\0') {
            return false;
        }
        let norm_input = path_str.replace('/', "\\");
        let norm_assets = self.assets_dir().to_string_lossy().replace('/', "\\");
        #[cfg(target_os = "windows")]
        {
            norm_input.to_ascii_lowercase().starts_with(&norm_assets.to_ascii_lowercase())
        }
        #[cfg(not(target_os = "windows"))]
        {
            std::path::Path::new(&norm_input).starts_with(std::path::Path::new(&norm_assets))
        }
    }
}

pub fn is_safe_id(s: &str) -> bool {
    !s.is_empty() && s.len() <= 64 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

pub fn sanitize_text(s: &str, max_len: usize) -> String {
    s.trim()
        .chars()
        .filter(|&c| c != '\0' && c != '/' && c != '\\')
        .take(max_len)
        .collect::<String>()
        .replace("..", "")
}

pub fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let data = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}
