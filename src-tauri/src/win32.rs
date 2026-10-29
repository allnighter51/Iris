//! Thin native Win32 layer: click-through overlay styles, placement,
//! capture exclusion, display refresh rate and single-pass process lookup.

use std::ffi::c_void;
use std::mem::size_of;
use std::sync::OnceLock;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{CloseHandle, HWND, RECT};
use windows::Win32::Graphics::Gdi::{
    EnumDisplaySettingsW, GetMonitorInfoW, MonitorFromWindow, DEVMODEW, ENUM_CURRENT_SETTINGS,
    MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Registry::{
    RegCloseKey, RegCreateKeyW, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW,
    HKEY, KEY_QUERY_VALUE, KEY_SET_VALUE, REG_EXPAND_SZ, REG_SZ, REG_VALUE_TYPE,
};
use windows::Win32::UI::Accessibility::{
    SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK,
};
use windows::Win32::UI::Shell::{
    SHQueryUserNotificationState, QUNS_RUNNING_D3D_FULL_SCREEN,
};
use windows::Win32::UI::WindowsAndMessaging::*;

static FOCUS_NOTIFIER: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();

unsafe extern "system" fn win_event_proc(
    _h_win_event_hook: HWINEVENTHOOK,
    _event: u32,
    _hwnd: HWND,
    _id_object: i32,
    _id_child: i32,
    _id_event_thread: u32,
    _dwms_event_time: u32,
) {
    if let Some(cb) = FOCUS_NOTIFIER.get() {
        cb();
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_millis(120));
            if let Some(cb) = FOCUS_NOTIFIER.get() {
                cb();
            }
            std::thread::sleep(std::time::Duration::from_millis(230));
            if let Some(cb) = FOCUS_NOTIFIER.get() {
                cb();
            }
        });
    }
}

/// Initializes an out-of-process Windows Event Hook for `EVENT_SYSTEM_FOREGROUND`.
/// Runs on a dedicated thread with a Win32 message pump.
/// Completely passive and safe with anti-cheat software (no DLL injection).
pub fn init_foreground_hook<F: Fn() + Send + Sync + 'static>(callback: F) {
    let _ = FOCUS_NOTIFIER.set(Box::new(callback));
    std::thread::spawn(|| {
        unsafe {
            let hook = SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_FOREGROUND,
                None,
                Some(win_event_proc),
                0,
                0,
                WINEVENT_OUTOFCONTEXT,
            );
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            if !hook.0.is_null() {
                let _ = UnhookWinEvent(hook);
            }
        }
    });
}

fn hwnd(raw: isize) -> HWND {
    HWND(raw as *mut c_void)
}

pub fn apply_overlay_styles(raw: isize) {
    unsafe {
        let h = hwnd(raw);
        let mut ex = GetWindowLongPtrW(h, GWL_EXSTYLE) as u32;
        ex |= WS_EX_LAYERED.0
            | WS_EX_TRANSPARENT.0
            | WS_EX_TOPMOST.0
            | WS_EX_TOOLWINDOW.0
            | WS_EX_NOACTIVATE.0;
        ex &= !WS_EX_APPWINDOW.0;
        SetWindowLongPtrW(h, GWL_EXSTYLE, ex as isize);
        let _ = SetWindowPos(
            h,
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
}

pub fn place(raw: isize, x: i32, y: i32, w: i32, h: i32) {
    unsafe {
        // Subtract 1px from height so the WS_POPUP HWND never equals the exact full monitor rect.
        // In Windows (win32k / DWM), a WS_POPUP window matching the exact monitor dimensions (0, 0, W, H)
        // is classified as a competing Fullscreen window and automatically demoted behind focused
        // fullscreen games, or breaks DWM DirectFlip overlay compositing.
        let safe_h = if h > 1 { h - 1 } else { h };
        let _ = SetWindowPos(hwnd(raw), Some(HWND_TOPMOST), x, y, w, safe_h, SWP_NOACTIVATE);
    }
}

pub fn show(raw: isize) {
    unsafe {
        let _ = ShowWindow(hwnd(raw), SW_SHOWNOACTIVATE);
        assert_topmost(raw);
    }
}

pub fn assert_topmost(raw: isize) {
    unsafe {
        let _ = SetWindowPos(
            hwnd(raw),
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
    }
}

/// Instantly re-asserts topmost status with SWP_SHOWWINDOW when focus transitions to the game,
/// cycling HWND_NOTOPMOST -> HWND_TOPMOST so win32k relinks our HWND at the very head of the
/// topmost Z-order chain above newly activated fullscreen / FSO windows.
pub fn reassert_topmost_instant(raw: isize) {
    unsafe {
        let h = hwnd(raw);
        let _ = SetWindowPos(
            h,
            Some(HWND_NOTOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
        let _ = SetWindowPos(
            h,
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );
    }
}

/// Queries the Windows Shell user notification state to determine if a 3D DirectX application
/// currently possesses true hardware Fullscreen Exclusive (FSE) display ownership.
/// When true, DWM desktop composition is bypassed, preventing external layered HWNDs from rendering.
pub fn is_d3d_fullscreen_exclusive() -> bool {
    unsafe {
        matches!(SHQueryUserNotificationState(), Ok(QUNS_RUNNING_D3D_FULL_SCREEN))
    }
}

/// Queries the monitor coordinates and dimensions for the monitor containing the currently focused foreground window.
/// Uses native Win32 `MonitorFromWindow` and `GetMonitorInfoW` to accurately capture dynamic display mode switches
/// (e.g., stretched resolutions like 1280x960 or 1440x1080) in real time.
pub fn get_foreground_monitor_rect() -> Option<(i32, i32, i32, i32)> {
    unsafe {
        let fg = GetForegroundWindow();
        if fg.0.is_null() {
            return None;
        }
        let hmon = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
        if hmon.0.is_null() {
            return None;
        }
        let mut mi = MONITORINFO {
            cbSize: size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(hmon, &mut mi).as_bool() {
            let r = mi.rcMonitor;
            let w = r.right - r.left;
            let h = r.bottom - r.top;
            if w > 0 && h > 0 {
                Some((r.left, r.top, w, h))
            } else {
                None
            }
        } else {
            None
        }
    }
}

pub fn hide(raw: isize) {
    unsafe {
        let _ = ShowWindow(hwnd(raw), SW_HIDE);
    }
}

pub fn set_capture_excluded(raw: isize, excluded: bool) {
    unsafe {
        let _ = SetWindowDisplayAffinity(
            hwnd(raw),
            if excluded { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE },
        );
    }
}

pub fn refresh_rate(device_name: &str) -> u32 {
    unsafe {
        let wide: Vec<u16> = device_name.encode_utf16().chain(Some(0)).collect();
        let mut dm = DEVMODEW { dmSize: size_of::<DEVMODEW>() as u16, ..Default::default() };
        if EnumDisplaySettingsW(PCWSTR(wide.as_ptr()), ENUM_CURRENT_SETTINGS, &mut dm).as_bool() {
            dm.dmDisplayFrequency
        } else {
            0
        }
    }
}

/// Zero-allocation case-insensitive comparison between a null-terminated UTF-16 buffer and an ASCII/UTF-8 target.
#[allow(dead_code)]
#[inline]
fn eq_utf16_ignore_ascii_case(wide: &[u16], target: &str) -> bool {
    let len = wide.iter().position(|&c| c == 0).unwrap_or(wide.len());
    if len != target.len() {
        return false;
    }
    wide[..len]
        .iter()
        .zip(target.bytes())
        .all(|(&w, b)| w <= 0x7F && (w as u8).eq_ignore_ascii_case(&b))
}

/// Calculates the center coordinates (cx, cy) of the currently focused foreground window.
pub fn get_foreground_window_center() -> Option<(i32, i32)> {
    unsafe {
        let fg = GetForegroundWindow();
        if fg.0.is_null() {
            return None;
        }
        let mut rect = RECT::default();
        if GetWindowRect(fg, &mut rect).is_ok() {
            let cx = (rect.left + rect.right) / 2;
            let cy = (rect.top + rect.bottom) / 2;
            Some((cx, cy))
        } else {
            None
        }
    }
}

/// Single-pass Toolhelp32 snapshot that resolves:
/// 1) Foreground window executable name (if any)
/// 2) First running process executable that matches `is_target` (if `check_running_target` is true)
pub fn poll_game_processes<F: Fn(&str) -> bool>(
    is_target: F,
    check_running_target: bool,
) -> (Option<String>, Option<String>) {
    unsafe {
        let fg_hwnd = GetForegroundWindow();
        let mut fg_pid = 0u32;
        if !fg_hwnd.0.is_null() {
            let _ = GetWindowThreadProcessId(fg_hwnd, Some(&mut fg_pid));
        }
        let want_fg = fg_pid != 0;
        let want_target = check_running_target;

        if !want_fg && !want_target {
            return (None, None);
        }

        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return (None, None);
        };
        let mut entry = PROCESSENTRY32W {
            dwSize: size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };

        let mut fg_name: Option<String> = None;
        let mut matched_running_exe: Option<String> = None;

        if Process32FirstW(snap, &mut entry).is_ok() {
            loop {
                let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                let exe_name = String::from_utf16_lossy(&entry.szExeFile[..len]);

                if want_fg && fg_name.is_none() && entry.th32ProcessID == fg_pid {
                    fg_name = Some(exe_name.clone());
                }
                if want_target && matched_running_exe.is_none() && is_target(&exe_name) {
                    matched_running_exe = Some(exe_name);
                }
                if (!want_fg || fg_name.is_some()) && (!want_target || matched_running_exe.is_some()) {
                    break;
                }
                if Process32NextW(snap, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snap);
        (fg_name, matched_running_exe)
    }
}

/// Single-pass kernel snapshot that resolves both:
/// 1) The foreground window's executable name (`None` if no foreground window)
/// 2) Whether `target_exe` or any `custom_targets` are currently running anywhere on the system
#[allow(dead_code)]
pub fn poll_processes(
    target_exe: &str,
    custom_targets: &[String],
    check_target: bool,
) -> (Option<String>, bool) {
    let target = target_exe.trim();
    unsafe {
        let fg_hwnd = GetForegroundWindow();
        let mut fg_pid = 0u32;
        if !fg_hwnd.0.is_null() {
            let _ = GetWindowThreadProcessId(fg_hwnd, Some(&mut fg_pid));
        }
        let want_fg = fg_pid != 0;
        let want_target = check_target && (!target.is_empty() || !custom_targets.is_empty());

        if !want_fg && !want_target {
            return (None, false);
        }

        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return (None, false);
        };
        let mut entry = PROCESSENTRY32W {
            dwSize: size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };

        let mut fg_name: Option<String> = None;
        let mut target_running = false;

        let is_target = |wide: &[u16]| -> bool {
            if !target.is_empty() && eq_utf16_ignore_ascii_case(wide, target) {
                return true;
            }
            for c in custom_targets {
                let ct = c.trim();
                if !ct.is_empty() && eq_utf16_ignore_ascii_case(wide, ct) {
                    return true;
                }
            }
            false
        };

        if Process32FirstW(snap, &mut entry).is_ok() {
            loop {
                if want_fg && fg_name.is_none() && entry.th32ProcessID == fg_pid {
                    let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                    fg_name = Some(String::from_utf16_lossy(&entry.szExeFile[..len]));
                }
                if want_target && !target_running && is_target(&entry.szExeFile) {
                    target_running = true;
                }
                if (!want_fg || fg_name.is_some()) && (!want_target || target_running) {
                    break;
                }
                if Process32NextW(snap, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snap);
        (fg_name, target_running)
    }
}

/// Native Win32 registry read for string (REG_SZ / REG_EXPAND_SZ) values under HKCU.
/// Performs in-process registry query without spawning `reg.exe` or shell processes.
pub fn reg_get_sz(hkey_root: HKEY, subkey: &str, value_name: Option<&str>) -> Option<String> {
    unsafe {
        let wide_sub: Vec<u16> = subkey.encode_utf16().chain(Some(0)).collect();
        let mut hkey = HKEY::default();
        if RegOpenKeyExW(
            hkey_root,
            PCWSTR(wide_sub.as_ptr()),
            None,
            KEY_QUERY_VALUE,
            &mut hkey,
        )
        .is_err()
        {
            return None;
        }

        let wide_name: Option<Vec<u16>> = value_name.map(|n| n.encode_utf16().chain(Some(0)).collect());
        let name_ptr = wide_name.as_ref().map_or(PCWSTR::null(), |w| PCWSTR(w.as_ptr()));

        let mut data_type = REG_VALUE_TYPE(0);
        let mut byte_len: u32 = 0;
        let query_res = RegQueryValueExW(
            hkey,
            name_ptr,
            None,
            Some(&mut data_type),
            None,
            Some(&mut byte_len),
        );

        if query_res.is_err() || (data_type != REG_SZ && data_type != REG_EXPAND_SZ) || byte_len < 2 {
            let _ = RegCloseKey(hkey);
            return None;
        }

        let mut buf: Vec<u8> = vec![0u8; byte_len as usize];
        let res = RegQueryValueExW(
            hkey,
            name_ptr,
            None,
            Some(&mut data_type),
            Some(buf.as_mut_ptr()),
            Some(&mut byte_len),
        );
        let _ = RegCloseKey(hkey);

        if res.is_ok() {
            let wide_slice: &[u16] = std::slice::from_raw_parts(buf.as_ptr() as *const u16, (byte_len as usize) / 2);
            let len = wide_slice.iter().position(|&c| c == 0).unwrap_or(wide_slice.len());
            Some(String::from_utf16_lossy(&wide_slice[..len]))
        } else {
            None
        }
    }
}

/// Native Win32 registry write for string (REG_SZ) values under HKCU.
/// Operates entirely in-process without spawning `reg.exe` or child processes.
pub fn reg_set_sz(hkey_root: HKEY, subkey: &str, value_name: Option<&str>, value_data: &str) -> bool {
    unsafe {
        let wide_sub: Vec<u16> = subkey.encode_utf16().chain(Some(0)).collect();
        let mut hkey = HKEY::default();
        if RegCreateKeyW(
            hkey_root,
            PCWSTR(wide_sub.as_ptr()),
            &mut hkey,
        )
        .is_err()
        {
            return false;
        }

        let wide_name: Option<Vec<u16>> = value_name.map(|n| n.encode_utf16().chain(Some(0)).collect());
        let name_ptr = wide_name.as_ref().map_or(PCWSTR::null(), |w| PCWSTR(w.as_ptr()));

        let wide_val: Vec<u16> = value_data.encode_utf16().chain(Some(0)).collect();
        let val_bytes = std::slice::from_raw_parts(wide_val.as_ptr() as *const u8, wide_val.len() * 2);

        let res = RegSetValueExW(hkey, name_ptr, None, REG_SZ, Some(val_bytes));
        let _ = RegCloseKey(hkey);
        res.is_ok()
    }
}

/// Native Win32 registry delete value under HKCU.
/// Operates in-process without spawning `reg.exe`.
pub fn reg_delete_val(hkey_root: HKEY, subkey: &str, value_name: &str) -> bool {
    unsafe {
        let wide_sub: Vec<u16> = subkey.encode_utf16().chain(Some(0)).collect();
        let mut hkey = HKEY::default();
        if RegOpenKeyExW(
            hkey_root,
            PCWSTR(wide_sub.as_ptr()),
            None,
            KEY_SET_VALUE,
            &mut hkey,
        )
        .is_err()
        {
            return false;
        }

        let wide_name: Vec<u16> = value_name.encode_utf16().chain(Some(0)).collect();
        let res = RegDeleteValueW(hkey, PCWSTR(wide_name.as_ptr()));
        let _ = RegCloseKey(hkey);
        res.is_ok()
    }
}

/// Returns a deduplicated list of active non-system process executable names.
/// Safe read-only Toolhelp32 snapshot enumeration.
pub fn list_running_processes() -> Vec<String> {
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return Vec::new();
        };
        let mut entry = PROCESSENTRY32W {
            dwSize: size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let mut set = std::collections::BTreeSet::new();
        if Process32FirstW(snap, &mut entry).is_ok() {
            loop {
                let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                let name = String::from_utf16_lossy(&entry.szExeFile[..len]);
                let lower = name.to_ascii_lowercase();
                if !lower.is_empty()
                    && !lower.contains("svchost")
                    && !lower.contains("conhost")
                    && !lower.contains("runtimebroker")
                    && !lower.contains("taskhostw")
                    && !lower.contains("systemidleprocess")
                    && !lower.contains("registry")
                    && !lower.contains("smss")
                    && !lower.contains("csrss")
                    && !lower.contains("wininit")
                    && !lower.contains("services")
                    && !lower.contains("lsass")
                    && !lower.contains("winlogon")
                    && !lower.contains("sihost")
                    && !lower.contains("fontdrvhost")
                    && !lower.contains("dwm")
                    && !lower.contains("spoolsv")
                    && !lower.contains("explorer")
                    && !lower.contains("searchindexer")
                    && !lower.contains("searchapp")
                    && !lower.contains("shellexperiencehost")
                    && !lower.contains("startmenuexperiencehost")
                    && !lower.contains("textinputhost")
                    && !lower.contains("iris.exe")
                {
                    set.insert(name);
                }
                if Process32NextW(snap, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snap);
        set.into_iter().collect()
    }
}
