//! Overlay window lifecycle: a single frameless, transparent, click-through
//! window per app that renders the active HUD or composite scene.

use crate::{model::*, win32};
use serde::Serialize;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const LABEL: &str = "overlay";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OverlayPayload {
    pub state: OverlayState,
    pub visible: bool,
    pub monitor_w: i32,
    pub monitor_h: i32,
    pub low_res: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OverlayStatus {
    pub enabled: bool,
    pub visible: bool,
    pub game_running: bool,
}

pub fn create_window(app: &AppHandle) -> tauri::Result<()> {
    let win = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("overlay.html".into()))
        .title("Iris Overlay")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .build()?;
    let _ = win.set_ignore_cursor_events(true);
    if let Ok(h) = win.hwnd() {
        win32::apply_overlay_styles(h.0 as isize);
    }
    Ok(())
}

fn monitor_rect(app: &AppHandle, idx: usize) -> (i32, i32, i32, i32) {
    let mons = app.available_monitors().unwrap_or_default();
    match mons.get(idx).or(mons.first()) {
        Some(m) => {
            let (p, s) = (m.position(), m.size());
            (p.x, p.y, s.width as i32, s.height as i32)
        }
        None => (0, 0, 1920, 1080),
    }
}

fn build_payload(app: &AppHandle, st: &AppState) -> (OverlayPayload, (i32, i32, i32, i32), bool, bool) {
    let o = st.overlay().clone();
    let s = st.settings().clone();
    let game = st.game_running.load(Ordering::Relaxed);
    let rect = monitor_rect(app, o.monitor);
    let visible = o.enabled && o.has_content() && (s.target_mode != "game" || game);
    let payload = OverlayPayload {
        state: o,
        visible,
        monitor_w: rect.2,
        monitor_h: rect.3,
        low_res: s.low_resource,
    };
    (payload, rect, game, s.hide_from_capture)
}

pub fn refresh(app: &AppHandle) {
    let st = app.state::<AppState>();
    let (payload, rect, game, hide_from_capture) = build_payload(app, &st);

    if let Some(win) = app.get_webview_window(LABEL) {
        place_and_show(&win, &st, rect, payload.visible, hide_from_capture);
    }
    let _ = app.emit_to(
        "main",
        "overlay-status",
        OverlayStatus {
            enabled: payload.state.enabled,
            visible: payload.visible,
            game_running: game,
        },
    );
    let _ = app.emit_to(LABEL, "overlay-state", payload);
}

fn place_and_show(
    win: &WebviewWindow,
    st: &AppState,
    rect: (i32, i32, i32, i32),
    visible: bool,
    excl: bool,
) {
    let Ok(h) = win.hwnd() else { return };
    let raw = h.0 as isize;
    {
        let mut last = st.last_rect();
        if *last != Some(rect) {
            win32::place(raw, rect.0, rect.1, rect.2, rect.3);
            *last = Some(rect);
        }
    }
    win32::set_capture_excluded(raw, excl);
    if visible {
        win32::show(raw);
    } else {
        win32::hide(raw);
    }
}

pub fn toggle(app: &AppHandle) {
    {
        let st = app.state::<AppState>();
        let mut o = st.overlay();
        o.enabled = !o.enabled;
    }
    refresh(app);
}

#[tauri::command]
pub fn overlay_apply(app: AppHandle, state: State<AppState>, mut overlay: OverlayState) {
    if let Some(ref p) = overlay.path {
        if !state.is_valid_asset_path(p) {
            overlay.path = None;
        }
    }
    overlay.scene.retain(|l| state.is_valid_asset_path(&l.path));
    overlay.scene.truncate(64);
    *state.overlay() = overlay;
    refresh(&app);
}

#[tauri::command]
pub fn overlay_get(app: AppHandle, state: State<AppState>) -> OverlayPayload {
    build_payload(&app, &state).0
}
