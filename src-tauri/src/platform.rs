use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::error::{AppError, AppResult};
use tauri::Manager;

/// Base directory for a fresh vault: the user's documents folder on every
/// platform, falling back to the home directory where none is defined.
pub fn default_vault_base_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .unwrap_or_else(|_| app.path().app_config_dir().unwrap_or_default())
}

#[cfg(windows)]
pub fn replace_file_atomic(source: &Path, target: &Path) -> AppResult<()> {
    use std::{iter, os::windows::ffi::OsStrExt};
    use windows::{
        Win32::Storage::FileSystem::{
            MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
        },
        core::PCWSTR,
    };

    let source_wide = source
        .as_os_str()
        .encode_wide()
        .chain(iter::once(0))
        .collect::<Vec<_>>();
    let target_wide = target
        .as_os_str()
        .encode_wide()
        .chain(iter::once(0))
        .collect::<Vec<_>>();
    unsafe {
        MoveFileExW(
            PCWSTR(source_wide.as_ptr()),
            PCWSTR(target_wide.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
        .map_err(|_| AppError::Io(std::io::Error::last_os_error()))?;
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn replace_file_atomic(source: &Path, target: &Path) -> AppResult<()> {
    fs::rename(source, target)?;
    Ok(())
}

#[cfg(windows)]
pub fn prepare_memory_lock_quota() {
    use windows::Win32::System::Threading::{GetCurrentProcess, SetProcessWorkingSetSize};

    // VirtualLock is bounded by the process minimum working set on Windows.
    // Reserve enough headroom before SQLCipher enables cipher_memory_security.
    unsafe {
        let process = GetCurrentProcess();
        let _ = SetProcessWorkingSetSize(process, 64 * 1024 * 1024, 512 * 1024 * 1024);
    }
}

#[cfg(not(windows))]
pub fn prepare_memory_lock_quota() {}

#[cfg(windows)]
pub fn owner_window_handle(window: &tauri::Window) -> AppResult<isize> {
    window.set_focus().map_err(|_| {
        AppError::Message(format!(
            "无法激活{}主窗口",
            crate::branding::current_app_display_name()
        ))
    })?;
    window.hwnd().map(|handle| handle.0 as isize).map_err(|_| {
        AppError::Message(format!(
            "无法取得{}主窗口句柄",
            crate::branding::current_app_display_name()
        ))
    })
}

#[cfg(not(windows))]
pub fn owner_window_handle(_window: &tauri::Window) -> AppResult<isize> {
    Ok(0)
}

fn window_theme(preference: &str) -> AppResult<Option<tauri::Theme>> {
    match preference {
        "system" => Ok(None),
        "light" => Ok(Some(tauri::Theme::Light)),
        "dark" => Ok(Some(tauri::Theme::Dark)),
        _ => Err(AppError::Validation("未知的外观主题".into())),
    }
}

pub fn apply_window_theme(window: &tauri::Window, preference: &str) -> AppResult<()> {
    window
        .set_theme(window_theme(preference)?)
        .map_err(|_| AppError::Message("无法同步 Windows 标题栏主题".into()))
}

#[cfg(windows)]
pub fn system_unlock_available() -> bool {
    use std::sync::OnceLock;
    use windows::Security::Credentials::UI::{
        UserConsentVerifier, UserConsentVerifierAvailability,
    };
    static AVAILABLE: OnceLock<bool> = OnceLock::new();
    *AVAILABLE.get_or_init(|| {
        UserConsentVerifier::CheckAvailabilityAsync()
            .and_then(|operation| operation.join())
            .map(|availability| availability == UserConsentVerifierAvailability::Available)
            .unwrap_or(false)
    })
}

#[cfg(not(windows))]
pub fn system_unlock_available() -> bool {
    false
}

#[cfg(windows)]
fn request_user_presence(owner_window: isize) -> AppResult<()> {
    use windows::{
        Security::Credentials::UI::{UserConsentVerificationResult, UserConsentVerifier},
        Win32::{
            Foundation::HWND, System::WinRT::IUserConsentVerifierInterop,
            UI::WindowsAndMessaging::SetForegroundWindow,
        },
        core::{HSTRING, factory},
    };
    use windows_future::IAsyncOperation;

    let owner = HWND(owner_window as *mut core::ffi::c_void);
    unsafe {
        let _ = SetForegroundWindow(owner);
    }
    let interop = factory::<UserConsentVerifier, IUserConsentVerifierInterop>()
        .map_err(|_| AppError::SystemUnlockDenied)?;
    let operation: IAsyncOperation<UserConsentVerificationResult> = unsafe {
        interop.RequestVerificationForWindowAsync(
            owner,
            &HSTRING::from(format!(
                "验证身份以解锁{}",
                crate::branding::current_app_display_name()
            )),
        )
    }
    .map_err(|_| AppError::SystemUnlockDenied)?;
    let result = operation.join().map_err(|_| AppError::SystemUnlockDenied)?;
    if result == UserConsentVerificationResult::Verified {
        Ok(())
    } else {
        Err(AppError::SystemUnlockDenied)
    }
}

#[cfg(windows)]
fn protect_for_current_user(data: &[u8]) -> AppResult<Vec<u8>> {
    use std::slice;
    use windows::Win32::{
        Foundation::{HLOCAL, LocalFree},
        Security::Cryptography::{CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData},
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptProtectData(
            &input,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
        .map_err(|_| AppError::Crypto)?;
        let value = slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(output.pbData.cast())));
        Ok(value)
    }
}

#[cfg(windows)]
fn unprotect_for_current_user(data: &[u8]) -> AppResult<Vec<u8>> {
    use std::slice;
    use windows::Win32::{
        Foundation::{HLOCAL, LocalFree},
        Security::Cryptography::{
            CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptUnprotectData,
        },
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptUnprotectData(
            &input,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
        .map_err(|_| AppError::InvalidCredential)?;
        let value = slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(output.pbData.cast())));
        Ok(value)
    }
}

#[cfg(windows)]
pub fn enable_system_unlock(path: &Path, vault_key: &[u8], owner_window: isize) -> AppResult<()> {
    if !system_unlock_available() {
        return Err(AppError::SystemUnlockUnavailable);
    }
    request_user_presence(owner_window)?;
    let protected = protect_for_current_user(vault_key)?;
    fs::write(path, protected)?;
    Ok(())
}

#[cfg(not(windows))]
pub fn enable_system_unlock(
    _path: &Path,
    _vault_key: &[u8],
    _owner_window: isize,
) -> AppResult<()> {
    Err(AppError::SystemUnlockUnavailable)
}

#[cfg(windows)]
pub fn unlock_with_system(path: &Path, owner_window: isize) -> AppResult<Vec<u8>> {
    if !system_unlock_available() || !path.exists() {
        return Err(AppError::SystemUnlockUnavailable);
    }
    request_user_presence(owner_window)?;
    unprotect_for_current_user(&fs::read(path)?)
}

#[cfg(not(windows))]
pub fn unlock_with_system(_path: &Path, _owner_window: isize) -> AppResult<Vec<u8>> {
    Err(AppError::SystemUnlockUnavailable)
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn system_unlock_operations_require_an_owner_window() {
        let _: fn(&Path, &[u8], isize) -> AppResult<()> = enable_system_unlock;
        let _: fn(&Path, isize) -> AppResult<Vec<u8>> = unlock_with_system;
    }

    #[test]
    fn maps_preferences_to_native_window_themes() {
        assert!(window_theme("system").unwrap().is_none());
        assert!(matches!(
            window_theme("light"),
            Ok(Some(tauri::Theme::Light))
        ));
        assert!(matches!(window_theme("dark"), Ok(Some(tauri::Theme::Dark))));
        assert!(window_theme("unknown").is_err());
    }
}

pub fn disable_system_unlock(path: &Path) -> AppResult<()> {
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

pub fn copy_with_expiry(value: String, seconds: u32) -> AppResult<()> {
    let mut clipboard =
        arboard::Clipboard::new().map_err(|_| AppError::Message("无法访问系统剪贴板".into()))?;
    clipboard
        .set_text(&value)
        .map_err(|_| AppError::Message("无法写入系统剪贴板".into()))?;
    std::thread::spawn(move || {
        let mut guarded = zeroize::Zeroizing::new(value);
        std::thread::sleep(std::time::Duration::from_secs(seconds as u64));
        if let Ok(mut clipboard) = arboard::Clipboard::new()
            && clipboard.get_text().ok().as_deref() == Some(guarded.as_str())
        {
            let _ = clipboard.set_text("");
        }
        use zeroize::Zeroize;
        guarded.zeroize();
    });
    Ok(())
}
