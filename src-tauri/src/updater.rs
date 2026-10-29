use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum UpdateStatus {
    Idle,
    Checking,
    #[serde(rename_all = "camelCase")]
    UpToDate {
        current_version: String,
    },
    #[serde(rename_all = "camelCase")]
    Available {
        version: String,
        current_version: String,
        body: Option<String>,
        date: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    Downloading {
        version: String,
        progress: f64,
        downloaded: u64,
        total: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Downloaded {
        version: String,
    },
    #[serde(rename_all = "camelCase")]
    Error {
        message: String,
    },
}

pub struct UpdaterState {
    pub status: Mutex<UpdateStatus>,
}

impl Default for UpdaterState {
    fn default() -> Self {
        Self {
            status: Mutex::new(UpdateStatus::Idle),
        }
    }
}

fn emit_status(app: &AppHandle, status: UpdateStatus) -> UpdateStatus {
    let st = app.state::<UpdaterState>();
    *st.status.lock().unwrap_or_else(|e| e.into_inner()) = status.clone();
    let _ = app.emit("updater-status", &status);
    status
}

fn build_updater(
    app: &AppHandle,
) -> Result<tauri_plugin_updater::Updater, tauri_plugin_updater::Error> {
    let mut builder = app.updater_builder();
    #[cfg(target_os = "windows")]
    {
        builder = builder.target("windows-x86_64-nsis");
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                builder = builder.installer_arg(format!("/D={}", dir.display()));
            }
        }
    }
    builder.build()
}

/// Non-blocking startup update check on a background thread.
pub fn check_on_startup(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(3));
        tauri::async_runtime::block_on(async move {
            let _ = check_for_updates_internal(&app, true).await;
        });
    });
}

pub async fn check_for_updates_internal(app: &AppHandle, silent: bool) -> UpdateStatus {
    let current_version = app.package_info().version.to_string();
    emit_status(app, UpdateStatus::Checking);

    let updater = match build_updater(app) {
        Ok(u) => u,
        Err(e) => {
            return emit_status(
                app,
                if silent {
                    UpdateStatus::UpToDate { current_version }
                } else {
                    UpdateStatus::Error {
                        message: format!("Updater initialization failed: {e}"),
                    }
                },
            );
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            let status = emit_status(
                app,
                UpdateStatus::Available {
                    version: update.version.clone(),
                    current_version,
                    body: update.body.clone(),
                    date: update.date.map(|d| d.to_string()),
                },
            );
            let _ = app.emit("updater-available-toast", &update.version);
            status
        }
        Ok(None) => emit_status(app, UpdateStatus::UpToDate { current_version }),
        Err(e) => {
            let err_str = e.to_string();
            let is_release_missing = err_str.contains("release")
                || err_str.contains("404")
                || err_str.contains("network")
                || err_str.contains("JSON")
                || err_str.contains("unreachable")
                || err_str.contains("status code");
            emit_status(
                app,
                if silent || is_release_missing {
                    UpdateStatus::UpToDate { current_version }
                } else {
                    UpdateStatus::Error {
                        message: format!("Could not reach update server: {err_str}"),
                    }
                },
            )
        }
    }
}

#[tauri::command]
pub fn updater_get_status(state: State<'_, UpdaterState>) -> UpdateStatus {
    state.status.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub async fn updater_check(app: AppHandle) -> Result<UpdateStatus, String> {
    Ok(check_for_updates_internal(&app, false).await)
}

#[tauri::command]
pub async fn updater_download_and_install(app: AppHandle) -> Result<UpdateStatus, String> {
    let updater = build_updater(&app).map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No update available to download".to_string())?;

    let version = update.version.clone();
    let app_progress = app.clone();
    let version_progress = version.clone();
    let mut downloaded: u64 = 0;

    let res = update
        .download_and_install(
            move |chunk_len, content_len| {
                downloaded += chunk_len as u64;
                let progress = content_len
                    .filter(|&t| t > 0)
                    .map(|t| (downloaded as f64 / t as f64 * 100.0).min(100.0))
                    .unwrap_or(0.0);
                emit_status(
                    &app_progress,
                    UpdateStatus::Downloading {
                        version: version_progress.clone(),
                        progress,
                        downloaded,
                        total: content_len,
                    },
                );
            },
            || {},
        )
        .await;

    match res {
        Ok(()) => Ok(emit_status(&app, UpdateStatus::Downloaded { version })),
        Err(e) => {
            let msg = format!("Download failed: {e}");
            emit_status(&app, UpdateStatus::Error { message: msg.clone() });
            Err(msg)
        }
    }
}

#[tauri::command]
pub fn updater_restart(app: AppHandle) {
    app.restart();
}
