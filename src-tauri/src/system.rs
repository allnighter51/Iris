//! System integration: global hotkeys, tray, autostart, monitors, game watcher.

use crate::{model::*, overlay, win32};
use serde::Serialize;
use std::{os::windows::process::CommandExt, sync::atomic::Ordering, time::Duration};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[derive(Clone)]
enum Action {
    Toggle,
    Next,
    Prev,
    /// toggle every layer with this role in the Layering stack
    Role(String),
}

fn handle(app: &AppHandle, action: Action) {
    match action {
        Action::Toggle => overlay::toggle(app),
        Action::Next => {
            let _ = app.emit_to("main", "cycle-overlay", 1);
        }
        Action::Prev => {
            let _ = app.emit_to("main", "cycle-overlay", -1);
        }
        Action::Role(role) => {
            let _ = app.emit_to("main", "toggle-layer-role", role);
        }
    }
}

pub fn register_hotkeys(app: &AppHandle) {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let s = app.state::<AppState>().settings.lock().unwrap().clone();
    let mut binds = vec![
        (s.hotkey_toggle, Action::Toggle),
        (s.hotkey_next, Action::Next),
        (s.hotkey_prev, Action::Prev),
    ];
    for (role, keys) in s.layer_hotkeys {
        binds.push((keys, Action::Role(role)));
    }
    for (keys, action) in binds {
        if keys.trim().is_empty() {
            continue;
        }
        let h = app.clone();
        let res = gs.on_shortcut(keys.as_str(), move |_app, _sc, ev| {
            if ev.state() == ShortcutState::Pressed {
                handle(&h, action.clone());
            }
        });
        if let Err(e) = res {
            eprintln!("hotkey '{keys}' not registered: {e}");
        }
    }
}

pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Iris", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", "Toggle Overlay", true, None::<&str>)?;
    let check_update = MenuItem::with_id(app, "check_update", "Check for Updates...", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &toggle, &check_update, &quit])?;
    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Iris")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, ev| match ev.id.as_ref() {
            "show" => show_main(app),
            "toggle" => overlay::toggle(app),
            "check_update" => crate::updater::handle_tray_action(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Polls for the target game process, emits foreground window changes,
/// and continuously keeps overlay on top of borderless/fullscreen games.
pub fn spawn_game_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_fg_exe: Option<String> = None;
        loop {
            let (mode, exe, low, enabled, _auto_switch, auto_hide) = {
                let st = app.state::<AppState>();
                let s = st.settings.lock().unwrap().clone();
                let o = st.overlay.lock().unwrap().clone();
                (s.target_mode, s.target_exe, s.low_resource, o.enabled, s.auto_game_switch, s.auto_hide_unfocused)
            };

            // Detect active foreground window process
            let fg = win32::get_foreground_process_name();
            if fg != last_fg_exe {
                let _ = app.emit_to("main", "foreground-process-changed", &fg);
                last_fg_exe = fg.clone();
            }

            let st = app.state::<AppState>();
            let running = mode == "game" && win32::process_running(exe.trim());
            if st.game_running.swap(running, Ordering::Relaxed) != running {
                overlay::refresh(&app);
            } else if enabled {
                // Auto-hide only suppresses if specifically in game mode and tabbed to non-game apps
                let is_unfocused_non_game = auto_hide && mode == "game" && fg.as_deref().map_or(false, |f| {
                    let f_lower = f.to_ascii_lowercase();
                    f_lower != "iris.exe" && (
                        f_lower.contains("discord")
                            || f_lower.contains("chrome")
                            || f_lower.contains("edge")
                            || f_lower.contains("firefox")
                            || f_lower.contains("explorer")
                            || f_lower.contains("code")
                            || f_lower.contains("spotify")
                    )
                });

                let is_visible_mode = mode != "game" || running;
                if let Some(w) = app.get_webview_window(overlay::LABEL) {
                    if let Ok(h) = w.hwnd() {
                        if is_visible_mode && !is_unfocused_non_game {
                            win32::show(h.0 as isize);
                            win32::assert_topmost(h.0 as isize);
                        } else {
                            win32::hide(h.0 as isize);
                        }
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(if low { 1500 } else { 600 }));
        }
    });
}

/// Registers the `iris://` URL protocol in HKCU (no admin required) so clicking
/// "Send to Iris" on veevisuals.art or Aether Deck opens Iris and imports overlays directly.
pub fn register_url_protocol() {
    let exe = std::env::current_exe().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
    if exe.is_empty() {
        return;
    }
    let _ = std::process::Command::new("reg")
        .args(["add", r"HKCU\Software\Classes\iris", "/ve", "/t", "REG_SZ", "/d", "URL:Iris Protocol", "/f"])
        .creation_flags(0x0800_0000)
        .output();
    let _ = std::process::Command::new("reg")
        .args(["add", r"HKCU\Software\Classes\iris", "/v", "URL Protocol", "/t", "REG_SZ", "/d", "", "/f"])
        .creation_flags(0x0800_0000)
        .output();
    let _ = std::process::Command::new("reg")
        .args(["add", r"HKCU\Software\Classes\iris\shell\open\command", "/ve", "/t", "REG_SZ", "/d", &format!("\"{exe}\" \"%1\""), "/f"])
        .creation_flags(0x0800_0000)
        .output();
}

pub fn set_autostart(enabled: bool) {
    const KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
    let mut cmd = std::process::Command::new("reg");
    if enabled {
        let exe = std::env::current_exe().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
        cmd.args(["add", KEY, "/v", "Iris", "/t", "REG_SZ", "/d", &format!("\"{exe}\" --minimized"), "/f"]);
    } else {
        cmd.args(["delete", KEY, "/v", "Iris", "/f"]);
    }
    let _ = cmd.creation_flags(0x0800_0000).output(); // CREATE_NO_WINDOW
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    index: usize,
    name: String,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    scale: f64,
    refresh_hz: u32,
}

#[tauri::command]
pub fn list_monitors(app: AppHandle) -> Vec<MonitorInfo> {
    app.available_monitors()
        .unwrap_or_default()
        .iter()
        .enumerate()
        .map(|(index, m)| {
            let name = m.name().cloned().unwrap_or_default();
            MonitorInfo {
                index,
                refresh_hz: win32::refresh_rate(&name),
                name,
                width: m.size().width,
                height: m.size().height,
                x: m.position().x,
                y: m.position().y,
                scale: m.scale_factor(),
            }
        })
        .collect()
}

#[tauri::command]
pub fn settings_get(state: State<AppState>) -> Settings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
pub fn settings_save(app: AppHandle, state: State<AppState>, settings: Settings) -> Result<Settings, String> {
    let prev_autostart = state.settings.lock().unwrap().start_with_windows;
    write_json_atomic(&state.settings_path(), &settings)?;
    *state.settings.lock().unwrap() = settings.clone();
    register_hotkeys(&app);
    if prev_autostart != settings.start_with_windows {
        set_autostart(settings.start_with_windows);
    }
    overlay::refresh(&app);
    Ok(settings)
}
