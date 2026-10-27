//! System integration: global hotkeys, system tray, single-pass game process
//! watcher, Windows startup registry entry, and monitor enumeration.

use crate::{model::*, overlay, win32};
use serde::Serialize;
use std::{
    os::windows::process::CommandExt,
    sync::atomic::Ordering,
    time::Duration,
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Open Iris", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", "Toggle Overlay", true, None::<&str>)?;
    let update = MenuItem::with_id(app, "check_updates", "Check for Updates", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Iris", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &toggle, &update, &sep, &quit])?;

    let mut builder = TrayIconBuilder::new()
        .tooltip("Iris — Custom HUD & Overlay Manager")
        .menu(&menu)
        .on_menu_event(|app, ev| match ev.id.as_ref() {
            "show" => show_main(app),
            "toggle" => overlay::toggle(app),
            "check_updates" => {
                show_main(app);
                let _ = app.emit_to("main", "navigate-tab", "settings");
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = crate::updater::updater_check(handle).await;
                });
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = ev
            {
                show_main(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

pub fn register_hotkeys(app: &AppHandle) {
    let s = app.state::<AppState>().settings().clone();
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();

    let bind = |key: &str, f: Box<dyn Fn(&AppHandle) + Send + Sync>| {
        let k = key.trim();
        if k.is_empty() {
            return;
        }
        if let Ok(sc) = k.parse::<Shortcut>() {
            let _ = gs.on_shortcut(sc, move |app, _, ev| {
                if ev.state == ShortcutState::Pressed {
                    f(app);
                }
            });
        }
    };

    bind(&s.hotkey_toggle, Box::new(|a| overlay::toggle(a)));
    bind(&s.hotkey_next, Box::new(|a| { let _ = a.emit_to("main", "cycle-overlay", 1i32); }));
    bind(&s.hotkey_prev, Box::new(|a| { let _ = a.emit_to("main", "cycle-overlay", -1i32); }));
    for (role, key) in s.layer_hotkeys {
        bind(&key, Box::new(move |a| { let _ = a.emit_to("main", "toggle-layer-role", role.clone()); }));
    }
}

pub fn spawn_game_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_fg_exe: Option<String> = None;
        let mut last_shown: Option<bool> = None;
        loop {
            let (mode, exe, low, enabled, auto_hide) = {
                let st = app.state::<AppState>();
                let s = st.settings().clone();
                let o = st.overlay();
                let on = o.enabled && o.has_content();
                (s.target_mode, s.target_exe, s.low_resource, on, s.auto_hide_unfocused)
            };

            let (fg, target_running) = win32::poll_processes(&exe, mode == "game");
            if fg != last_fg_exe {
                let _ = app.emit_to("main", "foreground-process-changed", &fg);
                last_fg_exe = fg.clone();
            }

            let st = app.state::<AppState>();
            let running = mode == "game" && target_running;
            if st.game_running.swap(running, Ordering::Relaxed) != running {
                overlay::refresh(&app);
            } else if enabled {
                let is_unfocused_non_game = auto_hide && mode == "game" && fg.as_deref().map_or(false, |f| {
                    let f_lower = f.to_ascii_lowercase();
                    f_lower != "iris.exe"
                        && ["discord", "chrome", "edge", "firefox", "explorer", "code", "spotify"]
                            .iter()
                            .any(|k| f_lower.contains(k))
                });

                let should_show = (mode != "game" || running) && !is_unfocused_non_game;
                if let Some(w) = app.get_webview_window(overlay::LABEL) {
                    if let Ok(h) = w.hwnd() {
                        if should_show {
                            win32::show(h.0 as isize);
                            last_shown = Some(true);
                        } else if last_shown != Some(false) {
                            win32::hide(h.0 as isize);
                            last_shown = Some(false);
                        }
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(if low { 1500 } else { 600 }));
        }
    });
}

fn run_reg(args: &[&str]) {
    let _ = std::process::Command::new("reg")
        .args(args)
        .creation_flags(0x0800_0000)
        .output();
}

pub fn register_url_protocol() {
    let exe = std::env::current_exe().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
    if exe.is_empty() {
        return;
    }
    run_reg(&["add", r"HKCU\Software\Classes\iris", "/ve", "/t", "REG_SZ", "/d", "URL:Iris Protocol", "/f"]);
    run_reg(&["add", r"HKCU\Software\Classes\iris", "/v", "URL Protocol", "/t", "REG_SZ", "/d", "", "/f"]);
    run_reg(&["add", r"HKCU\Software\Classes\iris\shell\open\command", "/ve", "/t", "REG_SZ", "/d", &format!("\"{exe}\" \"%1\""), "/f"]);
}

pub fn set_autostart(enabled: bool) {
    const KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
    if enabled {
        let exe = std::env::current_exe().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
        run_reg(&["add", KEY, "/v", "Iris", "/t", "REG_SZ", "/d", &format!("\"{exe}\" --minimized"), "/f"]);
    } else {
        run_reg(&["delete", KEY, "/v", "Iris", "/f"]);
    }
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
    state.settings().clone()
}

#[tauri::command]
pub fn settings_save(app: AppHandle, state: State<AppState>, mut settings: Settings) -> Result<Settings, String> {
    if settings.target_mode != "game" && settings.target_mode != "topmost" {
        settings.target_mode = "topmost".into();
    }
    settings.target_exe = sanitize_text(&settings.target_exe, 128);
    settings.hotkey_toggle = sanitize_text(&settings.hotkey_toggle, 64);
    settings.hotkey_next = sanitize_text(&settings.hotkey_next, 64);
    settings.hotkey_prev = sanitize_text(&settings.hotkey_prev, 64);
    settings.game_profiles.retain(|k, v| k.len() <= 64 && v.len() <= 128);
    settings.layer_hotkeys.retain(|k, v| KNOWN_ROLES.contains(&k.as_str()) && v.len() <= 64);

    let prev_autostart = state.settings().start_with_windows;
    write_json_atomic(&state.settings_path(), &settings)?;
    *state.settings() = settings.clone();
    register_hotkeys(&app);
    if prev_autostart != settings.start_with_windows {
        set_autostart(settings.start_with_windows);
    }
    overlay::refresh(&app);
    Ok(settings)
}
