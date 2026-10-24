//! Thin native Win32 layer: click-through overlay styles, placement,
//! capture exclusion, display refresh rate and process lookup.
//! All functions take the raw HWND value (`isize`) so they are independent of
//! the `windows` crate version Tauri links internally.

use std::ffi::c_void;
use std::mem::size_of;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{CloseHandle, HWND};
use windows::Win32::Graphics::Gdi::{EnumDisplaySettingsW, DEVMODEW, ENUM_CURRENT_SETTINGS};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::UI::WindowsAndMessaging::*;

fn hwnd(raw: isize) -> HWND {
    HWND(raw as *mut c_void)
}

/// WS_EX_LAYERED | WS_EX_TRANSPARENT (click-through, zero input latency)
/// | WS_EX_TOPMOST | WS_EX_TOOLWINDOW (no Alt+Tab / taskbar entry)
/// | WS_EX_NOACTIVATE (never steals focus from the game).
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

/// Cover the given physical-pixel rectangle (borderless "fullscreen").
pub fn place(raw: isize, x: i32, y: i32, w: i32, h: i32) {
    unsafe {
        let _ = SetWindowPos(hwnd(raw), Some(HWND_TOPMOST), x, y, w, h, SWP_NOACTIVATE);
    }
}

pub fn show(raw: isize) {
    unsafe {
        let _ = ShowWindow(hwnd(raw), SW_SHOWNOACTIVATE);
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

/// Reassert HWND_TOPMOST without stealing focus or moving the window.
/// Keeps overlay visible over borderless, windowed, and fullscreen (FSO) games.
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

pub fn hide(raw: isize) {
    unsafe {
        let _ = ShowWindow(hwnd(raw), SW_HIDE);
    }
}

/// `true` => WDA_EXCLUDEFROMCAPTURE (Win10 2004+): hidden from OBS/screenshots.
pub fn set_capture_excluded(raw: isize, excluded: bool) {
    unsafe {
        let _ = SetWindowDisplayAffinity(
            hwnd(raw),
            if excluded { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE },
        );
    }
}

/// Current refresh rate of a display by its GDI device name (`\\.\DISPLAY1`).
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

/// Is a process with this exe name (e.g. `Overwatch.exe`) running?
pub fn process_running(exe: &str) -> bool {
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return false };
        let mut entry = PROCESSENTRY32W { dwSize: size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut found = false;
        if Process32FirstW(snap, &mut entry).is_ok() {
            loop {
                let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                if String::from_utf16_lossy(&entry.szExeFile[..len]).eq_ignore_ascii_case(exe) {
                    found = true;
                    break;
                }
                if Process32NextW(snap, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snap);
        found
    }
}

/// Returns the executable name of the currently focused foreground window (e.g. `Overwatch.exe`).
pub fn get_foreground_process_name() -> Option<String> {
    unsafe {
        let h = GetForegroundWindow();
        if h.0.is_null() {
            return None;
        }
        let mut pid = 0u32;
        let _ = GetWindowThreadProcessId(h, Some(&mut pid));
        if pid == 0 {
            return None;
        }
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return None };
        let mut entry = PROCESSENTRY32W { dwSize: size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut result = None;
        if Process32FirstW(snap, &mut entry).is_ok() {
            loop {
                if entry.th32ProcessID == pid {
                    let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                    result = Some(String::from_utf16_lossy(&entry.szExeFile[..len]));
                    break;
                }
                if Process32NextW(snap, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snap);
        result
    }
}
