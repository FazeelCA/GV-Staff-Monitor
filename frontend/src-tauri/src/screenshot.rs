use image::codecs::jpeg::JpegEncoder;
use sha2::{Digest, Sha256};
use std::io::Cursor;
use xcap::Monitor;

// ─────────────────────────────────────────────────────────────────────────────
// Common entry point for all platforms using xcap (DXGI/Wayland/CoreGraphics)
// ─────────────────────────────────────────────────────────────────────────────

pub fn capture_screen(_app_handle: &tauri::AppHandle) -> Result<Vec<u8>, String> {
    let monitors = Monitor::all().map_err(|e| format!("Failed to enumerate monitors: {e}"))?;

    // Find the primary monitor, or fallback to the first available one
    let monitor = monitors
        .into_iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .unwrap_or_else(|| Monitor::all().unwrap().into_iter().next().unwrap());

    let image = monitor
        .capture_image()
        .map_err(|e| format!("Capture failed: {e}"))?;

    let mut buffer = Cursor::new(Vec::new());

    // Encode the raw RgbaImage directly to JPEG in memory
    let mut encoder = JpegEncoder::new_with_quality(&mut buffer, 40);
    encoder
        .encode(
            image.as_raw(),
            image.width(),
            image.height(),
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|e| format!("JPEG encode failed: {e}"))?;

    Ok(buffer.into_inner())
}

pub fn capture_screenshot(app_handle: &tauri::AppHandle) -> Result<(Vec<u8>, String), String> {
    let jpeg_bytes = capture_screen(app_handle)?;
    let mut hasher = Sha256::new();
    hasher.update(&jpeg_bytes);
    let hash = hex::encode(hasher.finalize());
    Ok((jpeg_bytes, hash))
}
