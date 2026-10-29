#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod games;
mod model;
mod overlay;
mod system;
mod updater;
mod vault;
mod win32;

use model::{AppState, Settings};
use tauri::{Emitter, Manager, WindowEvent};
use updater::UpdaterState;

fn main() {
    let root = model::default_root();
    let settings: Settings = model::read_json(&root.join("settings.json")).unwrap_or_default();

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
                if arg.starts_with("iris://") && arg.len() <= 4096 {
                    let _ = app.emit_to("main", "iris-protocol-url", arg);
                }
            }
        }))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::new(root, settings))
        .manage(UpdaterState::default())
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
            overlay::overlay_get_fse_status,
            system::list_monitors,
            system::list_running_processes,
            system::settings_get,
            system::settings_save,
            updater::updater_check,
            updater::updater_download_and_install,
            updater::updater_restart,
            updater::updater_get_status,
            updater::get_app_version,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            overlay::create_window(&handle)?;
            let _ = system::build_tray(&handle);
            system::register_hotkeys(&handle);
            system::register_url_protocol();
            system::init_focus_hook(handle.clone());
            system::spawn_game_watcher(handle.clone());

            let check_startup = app.state::<AppState>().settings().check_updates_on_startup;
            if check_startup {
                updater::check_on_startup(handle.clone());
            }

            for arg in std::env::args() {
                if arg.starts_with("iris://") && arg.len() <= 4096 {
                    let h = handle.clone();
                    let url = arg.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(900));
                        let _ = h.emit_to("main", "iris-protocol-url", url);
                    });
                }
            }

            let minimized = std::env::args().any(|a| a == "--minimized");
            if !minimized {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    let app = window.app_handle();
                    let to_tray = app.state::<AppState>().settings().close_to_tray;
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
