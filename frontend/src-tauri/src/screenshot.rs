use sha2::{Digest, Sha256};

// ─────────────────────────────────────────────────────────────────────────────
// Windows: Utilize abstract windows-capture engine
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
pub fn capture_screen(app_handle: &tauri::AppHandle) -> Result<Vec<u8>, String> {
    crate::capture::capture_desktop(app_handle)
}

// ─────────────────────────────────────────────────────────────────────────────
// macOS: native `screencapture` CLI (reliable permission handling)
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(not(target_os = "windows"))]
pub fn capture_screen(app_handle: &tauri::AppHandle) -> Result<Vec<u8>, String> {
    crate::capture::capture_desktop(app_handle)
}

// ─────────────────────────────────────────────────────────────────────────────
// Common entry point
// ─────────────────────────────────────────────────────────────────────────────

pub fn capture_screenshot(app_handle: &tauri::AppHandle) -> Result<(Vec<u8>, String), String> {
    let jpeg_bytes = capture_screen(app_handle)?;
    let mut hasher = Sha256::new();
    hasher.update(&jpeg_bytes);
    let hash = hex::encode(hasher.finalize());
    Ok((jpeg_bytes, hash))
}
