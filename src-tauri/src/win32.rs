//! Thin native Win32 layer: click-through overlay styles, placement,
//! capture exclusion, display refresh rate and single-pass process lookup.

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
        let _ = SetWindowPos(hwnd(raw), Some(HWND_TOPMOST), x, y, w, h, SWP_NOACTIVATE);
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

/// Single-pass kernel snapshot that resolves both:
/// 1) The foreground window's executable name (`None` if no foreground window)
/// 2) Whether `target_exe` is currently running anywhere on the system
pub fn poll_processes(target_exe: &str, check_target: bool) -> (Option<String>, bool) {
    let target = target_exe.trim();
    unsafe {
        let fg_hwnd = GetForegroundWindow();
        let mut fg_pid = 0u32;
        if !fg_hwnd.0.is_null() {
            let _ = GetWindowThreadProcessId(fg_hwnd, Some(&mut fg_pid));
        }
        let want_fg = fg_pid != 0;
        let want_target = check_target && !target.is_empty();

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

        if Process32FirstW(snap, &mut entry).is_ok() {
            loop {
                if want_fg && fg_name.is_none() && entry.th32ProcessID == fg_pid {
                    let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                    fg_name = Some(String::from_utf16_lossy(&entry.szExeFile[..len]));
                }
                if want_target && !target_running && eq_utf16_ignore_ascii_case(&entry.szExeFile, target) {
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
