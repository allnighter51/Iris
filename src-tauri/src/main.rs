#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod model;
mod overlay;
mod system;
mod vault;
mod win32;

use model::{AppState, Settings};
use tauri::{Emitter, Manager, WindowEvent};

fn main() {
    let root = model::default_root();
    let settings: Settings = model::read_json(&root.join("settings.json")).unwrap_or_default();

    // WebView2 flags must be set before any webview is created.
    let mut browser_args = String::from(
        "--disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding",
    );
    if !settings.hardware_acceleration {
        browser_args.push_str(" --disable-gpu");
    }
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", browser_args);

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            system::show_main(app);
            for arg in argv {
                if arg.starts_with("iris://") {
                    let _ = app.emit_to("main", "iris-protocol-url", arg);
                }
            }
        }))
        .manage(AppState::new(root, settings))
        .invoke_handler(tauri::generate_handler![
            vault::vault_load,
            vault::import_asset,
            vault::save_thumbnail,
            vault::vault_update_item,
            vault::vault_delete_item,
            vault::vault_create_folder,
            vault::vault_delete_folder,
            vault::open_vault_dir,
            vault::preset_save,
            vault::preset_delete,
            overlay::overlay_apply,
            overlay::overlay_get,
            system::list_monitors,
            system::settings_get,
            system::settings_save,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            overlay::create_window(&handle)?;
            system::build_tray(&handle)?;
            system::register_hotkeys(&handle);
            system::register_url_protocol();
            system::spawn_game_watcher(handle.clone());
            if !std::env::args().any(|a| a == "--minimized") {
                system::show_main(&handle);
            }
            // If opened via iris:// custom URL protocol, dispatch to UI
            for arg in std::env::args() {
                if arg.starts_with("iris://") {
                    let h = handle.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(800));
                        let _ = h.emit_to("main", "iris-protocol-url", arg);
                    });
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let app = window.app_handle();
                    let to_tray = app.state::<AppState>().settings.lock().unwrap().close_to_tray;
                    if to_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        app.exit(0);
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Iris");
}
