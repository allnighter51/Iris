//! System integration: global hotkeys, system tray, single-pass game process
//! watcher, Windows startup registry entry, and monitor enumeration.

use crate::{model::*, overlay, win32};
use serde::Serialize;
use std::{sync::atomic::Ordering, time::Duration};
use windows::Win32::System::Registry::HKEY_CURRENT_USER;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        if let Ok(h) = w.hwnd() {
            unsafe {
                let _ = windows::Win32::UI::WindowsAndMessaging::ShowWindow(
                    windows::Win32::Foundation::HWND(h.0 as *mut std::ffi::c_void),
                    windows::Win32::UI::WindowsAndMessaging::SW_RESTORE,
                );
                let _ = windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow(
                    windows::Win32::Foundation::HWND(h.0 as *mut std::ffi::c_void),
                );
            }
        }
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

    let bind = |key: &str, role_desc: &str, f: Box<dyn Fn(&AppHandle) + Send + Sync>| {
        let k = key.trim();
        if k.is_empty() {
            return;
        }
        match k.parse::<Shortcut>() {
            Ok(sc) => {
                if let Err(e) = gs.on_shortcut(sc, move |app, _, ev| {
                    if ev.state == ShortcutState::Pressed {
                        f(app);
                    }
                }) {
                    eprintln!("[Iris] Hotkey collision for '{}' ({}): {}", k, role_desc, e);
                    let _ = app.emit_to("main", "overlay-hotkey-conflict", format!("{}: {}", role_desc, k));
                }
            }
            Err(e) => {
                eprintln!("[Iris] Invalid shortcut '{}': {}", k, e);
            }
        }
    };

    bind(&s.hotkey_toggle, "Toggle Overlay", Box::new(|a| overlay::toggle(a)));
    bind(&s.hotkey_next, "Next Overlay", Box::new(|a| { let _ = a.emit_to("main", "cycle-overlay", 1i32); }));
    bind(&s.hotkey_prev, "Previous Overlay", Box::new(|a| { let _ = a.emit_to("main", "cycle-overlay", -1i32); }));
    for (role, key) in s.layer_hotkeys {
        let desc = format!("Layer {}", role);
        bind(&key, &desc, Box::new(move |a| { let _ = a.emit_to("main", "toggle-layer-role", role.clone()); }));
    }
}

/// Registers an instant foreground focus hook that re-asserts topmost status
/// the moment focus transitions to a game window, winning the Z-order race against borderless / FSO games.
pub fn init_focus_hook(app: AppHandle) {
    win32::init_foreground_hook(move || {
        let st = app.state::<AppState>();
        let o = st.overlay();
        if o.enabled && o.has_content() {
            if let Some(w) = app.get_webview_window(overlay::LABEL) {
                if let Ok(h) = w.hwnd() {
                    win32::reassert_topmost_instant(h.0 as isize);
                }
            }
        }
    });
}

/// Background thread monitoring active foreground process, target game presence,
/// display resolution changes (stretched resolutions), and Fullscreen Exclusive (FSE) state.
/// AV Safety: Uses `win32::poll_game_processes` (read-only Toolhelp32 process snapshot iteration).
/// Never shells out to `tasklist.exe`, `wmic`, or `powershell.exe`, and never opens process handles
/// with elevated or VM read access (no `PROCESS_ALL_ACCESS` or `PROCESS_VM_READ`).
pub fn spawn_game_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_fg_exe: Option<String> = None;
        let mut last_shown: Option<bool> = None;
        let mut last_rect: Option<(i32, i32, i32, i32)> = None;
        loop {
            let (is_smart, smart_all, enabled_ids, exe, low, enabled, auto_hide, poll_ms, custom_exes) = {
                let st = app.state::<AppState>();
                let s = st.settings().clone();
                let o = st.overlay();
                let on = o.enabled && o.has_content();
                (
                    s.is_smart_detect(),
                    s.smart_detect_all,
                    s.enabled_game_ids,
                    s.target_exe,
                    s.low_resource,
                    on,
                    s.auto_hide_unfocused,
                    s.watcher_poll_ms,
                    s.custom_target_exes,
                )
            };

            let (fg, matched_running_game) = win32::poll_game_processes(
                |candidate| {
                    crate::games::is_target_active(candidate, smart_all, &enabled_ids, &custom_exes, &exe)
                },
                is_smart,
            );

            let is_target_fg = fg.as_deref().map_or(false, |f| {
                crate::games::is_target_active(f, smart_all, &enabled_ids, &custom_exes, &exe)
            });

            if fg != last_fg_exe {
                let _ = app.emit_to("main", "foreground-process-changed", &fg);
                last_fg_exe = fg.clone();

                // Instant topmost re-assertion on foreground window transition
                if enabled && (!is_smart || is_target_fg) {
                    if let Some(w) = app.get_webview_window(overlay::LABEL) {
                        if let Ok(h) = w.hwnd() {
                            win32::reassert_topmost_instant(h.0 as isize);
                        }
                    }
                }
            }

            let st = app.state::<AppState>();
            let running = if is_smart {
                if let Some(ref r_exe) = matched_running_game {
                    let title = crate::games::find_game_by_exe(r_exe)
                        .map(|g| g.name.to_string())
                        .unwrap_or_else(|| r_exe.replace(".exe", ""));
                    st.set_active_game(Some(title), Some(r_exe.clone()));
                    true
                } else if is_target_fg {
                    let fg_name = fg.clone().unwrap_or_default();
                    let title = crate::games::find_game_by_exe(&fg_name)
                        .map(|g| g.name.to_string())
                        .unwrap_or_else(|| fg_name.replace(".exe", ""));
                    st.set_active_game(Some(title), Some(fg_name));
                    true
                } else {
                    st.set_active_game(None, None);
                    false
                }
            } else {
                if let Some(ref fg_name) = fg {
                    if let Some(g) = crate::games::find_game_by_exe(fg_name) {
                        st.set_active_game(Some(g.name.to_string()), Some(fg_name.clone()));
                    } else if custom_exes.iter().any(|c| c.eq_ignore_ascii_case(fg_name)) {
                        st.set_active_game(Some(fg_name.replace(".exe", "")), Some(fg_name.clone()));
                    } else {
                        st.set_active_game(None, None);
                    }
                } else {
                    st.set_active_game(None, None);
                }
                true
            };

            // Dynamically query monitor rect: when target game is focused, query its active monitor
            // to automatically adapt to stretched resolution switches (e.g. 1280x960, 1440x1080)
            let current_rect = if is_target_fg {
                win32::get_foreground_monitor_rect().unwrap_or_else(|| overlay::active_monitor_rect(&app, &st))
            } else {
                overlay::active_monitor_rect(&app, &st)
            };

            let monitor_changed = last_rect.map_or(true, |lr| lr != current_rect);
            if monitor_changed {
                last_rect = Some(current_rect);
            }

            // Fullscreen Exclusive (FSE) Detection
            let is_fse_now = is_target_fg && win32::is_d3d_fullscreen_exclusive();
            let current_fse = if is_smart && !running {
                FseStatus { is_fse: false, game_exe: None }
            } else if is_fse_now {
                FseStatus { is_fse: true, game_exe: fg.clone() }
            } else if is_target_fg && !is_fse_now {
                FseStatus { is_fse: false, game_exe: None }
            } else {
                st.fse_status().clone()
            };

            if *st.fse_status() != current_fse {
                *st.fse_status() = current_fse.clone();
                let _ = app.emit_to("main", "overlay-fse-status", &current_fse);
            }

            if st.game_running.swap(running, Ordering::Relaxed) != running || (enabled && monitor_changed) {
                overlay::refresh(&app);
            } else if enabled {
                let is_unfocused_non_game = auto_hide && is_smart && fg.as_deref().map_or(false, |f| {
                    let f_lower = f.to_ascii_lowercase();
                    f_lower != "iris.exe"
                        && !is_target_fg
                        && ["discord", "chrome", "edge", "firefox", "explorer", "code", "spotify"]
                            .iter()
                            .any(|k| f_lower.contains(k))
                });

                let should_show = (!is_smart || running) && !is_unfocused_non_game;
                if let Some(w) = app.get_webview_window(overlay::LABEL) {
                    if let Ok(h) = w.hwnd() {
                        if should_show {
                            if last_shown != Some(true) {
                                win32::show(h.0 as isize);
                                last_shown = Some(true);
                            }
                        } else if last_shown != Some(false) {
                            win32::hide(h.0 as isize);
                            last_shown = Some(false);
                        }
                    }
                }
            }
            let sleep_ms = if low { 1500 } else { poll_ms.clamp(100, 3000) };
            std::thread::sleep(Duration::from_millis(sleep_ms));
        }
    });
}

/// Registers the custom `iris://` URI protocol in user registry (HKCU).
/// Uses purely native Win32 Registry APIs without spawning `reg.exe` or shell processes.
/// Performs an initial equality check to avoid redundant registry writes on every launch.
pub fn register_url_protocol() {
    let exe = std::env::current_exe().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
    if exe.is_empty() {
        return;
    }
    let expected_cmd = format!("\"{exe}\" \"%1\"");
    // Skip writes if already registered to this executable:
    if let Some(cur) = win32::reg_get_sz(HKEY_CURRENT_USER, r"Software\Classes\iris\shell\open\command", None) {
        if cur.eq_ignore_ascii_case(&expected_cmd) {
            return;
        }
    }
    win32::reg_set_sz(HKEY_CURRENT_USER, r"Software\Classes\iris", None, "URL:Iris Protocol");
    win32::reg_set_sz(HKEY_CURRENT_USER, r"Software\Classes\iris", Some("URL Protocol"), "");
    win32::reg_set_sz(HKEY_CURRENT_USER, r"Software\Classes\iris\shell\open\command", None, &expected_cmd);
}

/// Sets or deletes the Windows startup autostart entry under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
/// Uses native Win32 Registry API directly without spawning `reg.exe`.
/// IMPORTANT: Only called when the user explicitly toggles the "Launch on Windows Startup" setting in the UI.
pub fn set_autostart(enabled: bool) {
    const KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    if enabled {
        let exe = std::env::current_exe().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
        if !exe.is_empty() {
            win32::reg_set_sz(HKEY_CURRENT_USER, KEY, Some("Iris"), &format!("\"{exe}\" --minimized"));
        }
    } else {
        win32::reg_delete_val(HKEY_CURRENT_USER, KEY, "Iris");
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
pub fn list_running_processes() -> Vec<String> {
    win32::list_running_processes()
}

#[tauri::command]
pub fn settings_get(state: State<AppState>) -> Settings {
    state.settings().clone()
}

#[tauri::command]
pub fn settings_save(app: AppHandle, state: State<AppState>, mut settings: Settings) -> Result<Settings, String> {
    if settings.target_mode != "game"
        && settings.target_mode != "topmost"
        && settings.target_mode != "smart_detect"
        && settings.target_mode != "force_on_screen"
    {
        settings.target_mode = "topmost".into();
    }
    settings.target_exe = sanitize_text(&settings.target_exe, 128);
    settings.hotkey_toggle = sanitize_text(&settings.hotkey_toggle, 64);
    settings.hotkey_next = sanitize_text(&settings.hotkey_next, 64);
    settings.hotkey_prev = sanitize_text(&settings.hotkey_prev, 64);
    settings.game_profiles.retain(|k, v| k.len() <= 64 && v.len() <= 128);
    settings.layer_hotkeys.retain(|k, v| KNOWN_ROLES.contains(&k.as_str()) && v.len() <= 64);
    settings.custom_target_exes.retain(|c| c.len() <= 128);
    settings.enabled_game_ids.retain(|id| id.len() <= 64);

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
