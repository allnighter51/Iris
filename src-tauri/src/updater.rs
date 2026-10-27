//! Automatic update management wrapping tauri-plugin-updater with overlay focus protection.

use crate::model::AppState;
use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::Ordering,
    Mutex,
};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum UpdateStatus {
    Idle,
    Checking,
    UpToDate {
        current_version: String,
    },
    Available {
        version: String,
        current_version: String,
        body: Option<String>,
        date: Option<String>,
    },
    Downloading {
        version: String,
        progress: f64,
        downloaded: u64,
        total: Option<u64>,
    },
    Downloaded {
        version: String,
    },
    Error {
        message: String,
    },
}

static STATUS: Mutex<UpdateStatus> = Mutex::new(UpdateStatus::Idle);
static PENDING_UPDATE: Mutex<Option<tauri_plugin_updater::Update>> = Mutex::new(None);

/// Launches a background check on startup after a short delay so normal app startup
/// is never blocked or slowed down.
pub fn check_on_startup(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Allow app initialization and window rendering to complete smoothly
        std::thread::sleep(Duration::from_secs(3));

        let should_check = {
            let st = app.state::<AppState>();
            let s = st.settings.lock().unwrap();
            s.check_updates_on_startup
        };

        if !should_check {
            return;
        }

        // Silent check on startup - offline or unreachable errors are logged and ignored
        match run_check(&app).await {
            Ok(Some(update)) => {
                let (overlay_active, game_running) = {
                    let st = app.state::<AppState>();
                    let ov_enabled = st.overlay.lock().unwrap().enabled;
                    let gm_running = st.game_running.load(Ordering::Relaxed);
                    (ov_enabled, gm_running)
                };

                let version = update.version.clone();
                let current_version = update.current_version.clone();
                let body = update.body.clone();
                let date = update.date.map(|d| d.to_string());

                *PENDING_UPDATE.lock().unwrap() = Some(update);
                let new_status = UpdateStatus::Available {
                    version: version.clone(),
                    current_version,
                    body,
                    date,
                };
                *STATUS.lock().unwrap() = new_status.clone();
                let _ = app.emit("updater-status", &new_status);

                // Focus Safety Rule: Never steal window focus or display popups while
                // an in-game overlay is active or a game process is running.
                if !overlay_active && !game_running {
                    let _ = app.emit("updater-available-toast", &version);
                }
            }
            Ok(None) => {
                // Up to date; keep idle on startup to avoid cluttering UI
                let current_version = app.package_info().version.to_string();
                *STATUS.lock().unwrap() = UpdateStatus::UpToDate { current_version };
            }
            Err(e) => {
                // Fail silently on startup
                eprintln!("[Iris Updater] Startup update check skipped or failed: {e}");
            }
        }
    });
}

/// Core updater check routine.
async fn run_check(app: &AppHandle) -> Result<Option<tauri_plugin_updater::Update>, String> {
    let updater = app.updater().map_err(|e| {
        let msg = e.to_string();
        if msg.contains("pubkey") || msg.contains("placeholder") {
            "Minisign public key is not configured or using placeholder. Generate your keypair and update tauri.conf.json.".to_string()
        } else {
            msg
        }
    })?;

    updater.check().await.map_err(|e| {
        let msg = e.to_string();
        if msg.contains("pubkey") || msg.contains("placeholder") {
            "Minisign public key is not configured or using placeholder. Generate your keypair and update tauri.conf.json.".to_string()
        } else {
            msg
        }
    })
}

#[tauri::command]
pub async fn updater_check(app: AppHandle) -> Result<UpdateStatus, String> {
    *STATUS.lock().unwrap() = UpdateStatus::Checking;
    let _ = app.emit("updater-status", UpdateStatus::Checking);

    match run_check(&app).await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            let current_version = update.current_version.clone();
            let body = update.body.clone();
            let date = update.date.map(|d| d.to_string());

            *PENDING_UPDATE.lock().unwrap() = Some(update);
            let status = UpdateStatus::Available {
                version,
                current_version,
                body,
                date,
            };
            *STATUS.lock().unwrap() = status.clone();
            let _ = app.emit("updater-status", &status);
            Ok(status)
        }
        Ok(None) => {
            *PENDING_UPDATE.lock().unwrap() = None;
            let current_version = app.package_info().version.to_string();
            let status = UpdateStatus::UpToDate { current_version };
            *STATUS.lock().unwrap() = status.clone();
            let _ = app.emit("updater-status", &status);
            Ok(status)
        }
        Err(e) => {
            let status = UpdateStatus::Error { message: e.clone() };
            *STATUS.lock().unwrap() = status.clone();
            let _ = app.emit("updater-status", &status);
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn updater_download_and_install(app: AppHandle) -> Result<(), String> {
    let update = {
        let mut guard = PENDING_UPDATE.lock().unwrap();
        guard.take()
    };

    let update = match update {
        Some(u) => u,
        None => {
            // If no pending update is cached, try checking first
            match run_check(&app).await? {
                Some(u) => u,
                None => return Err("No update available to download".into()),
            }
        }
    };

    let version = update.version.clone();
    let version_for_cb = version.clone();
    let app_for_cb = app.clone();
    let mut downloaded_bytes: u64 = 0;

    let download_result = update
        .download_and_install(
            move |chunk_length, content_length| {
                downloaded_bytes += chunk_length as u64;
                let progress = if let Some(total) = content_length {
                    if total > 0 {
                        (downloaded_bytes as f64 / total as f64) * 100.0
                    } else {
                        0.0
                    }
                } else {
                    0.0
                };

                let st = UpdateStatus::Downloading {
                    version: version_for_cb.clone(),
                    progress,
                    downloaded: downloaded_bytes,
                    total: content_length,
                };
                *STATUS.lock().unwrap() = st.clone();
                let _ = app_for_cb.emit("updater-status", &st);
            },
            || {
                eprintln!("[Iris Updater] Update downloaded successfully; staging installation.");
            },
        )
        .await;

    match download_result {
        Ok(_) => {
            let st = UpdateStatus::Downloaded { version: version.clone() };
            *STATUS.lock().unwrap() = st.clone();
            let _ = app.emit("updater-status", &st);
            Ok(())
        }
        Err(e) => {
            let err_msg = e.to_string();
            let st = UpdateStatus::Error { message: err_msg.clone() };
            *STATUS.lock().unwrap() = st.clone();
            let _ = app.emit("updater-status", &st);
            Err(err_msg)
        }
    }
}

#[tauri::command]
pub fn updater_restart(app: AppHandle) {
    app.restart();
}

#[tauri::command]
pub fn updater_get_status(_app: AppHandle) -> UpdateStatus {
    STATUS.lock().unwrap().clone()
}

/// Handles click on tray item.
pub fn handle_tray_action(app: &AppHandle) {
    let current_status = STATUS.lock().unwrap().clone();
    match current_status {
        UpdateStatus::Downloaded { .. } => {
            app.restart();
        }
        _ => {
            crate::system::show_main(app);
            let _ = app.emit_to("main", "navigate-tab", "settings");
            let app_h = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = updater_check(app_h).await;
            });
        }
    }
}
