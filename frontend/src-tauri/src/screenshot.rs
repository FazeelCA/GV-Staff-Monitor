use image::codecs::jpeg::JpegEncoder;
use sha2::{Digest, Sha256};
use std::io::Cursor;

// ─────────────────────────────────────────────────────────────────────────────
// Universal Fallback: xcap (GDI / CoreGraphics)
// ─────────────────────────────────────────────────────────────────────────────
fn capture_screen_xcap() -> Result<Vec<u8>, String> {
    let monitors =
        xcap::Monitor::all().map_err(|e| format!("xcap failed to enumerate monitors: {e}"))?;

    let monitor = match monitors
        .into_iter()
        .find(|m| m.is_primary().unwrap_or(false))
    {
        Some(m) => m,
        None => {
            let all = xcap::Monitor::all().map_err(|e| {
                format!("Primary monitor not found, and fallback Monitor::all() failed: {e}")
            })?;
            all.into_iter()
                .next()
                .ok_or_else(|| "No monitors detected by xcap on this system".to_string())?
        }
    };

    let image = monitor
        .capture_image()
        .map_err(|e| format!("xcap display capture failed completely: {e}"))?;

    let mut dyn_img = image::DynamicImage::ImageRgba8(image);

    // Workfolio standard: limit to maximum 720p height to preserve upload bandwidth 
    if dyn_img.height() > 720 {
        let aspect_ratio = dyn_img.width() as f32 / dyn_img.height() as f32;
        let new_width = (720.0 * aspect_ratio) as u32;
        dyn_img = dyn_img.resize_exact(new_width, 720, image::imageops::FilterType::Triangle);
    }

    // Explicitly cast to Rgb8 *after* resizing to discard alpha channel, 
    // preventing JpegEncoder panics
    let rgb_image = dyn_img.to_rgb8();

    let mut buffer = Cursor::new(Vec::new());
    let mut encoder = JpegEncoder::new_with_quality(&mut buffer, 50);
    encoder
        .encode(
            rgb_image.as_raw(),
            rgb_image.width(),
            rgb_image.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| format!("JPEG encode failed: {e}"))?;

    Ok(buffer.into_inner())
}

pub fn capture_screen(_app_handle: &tauri::AppHandle) -> Result<Vec<u8>, String> {
    capture_screen_xcap()
}

pub fn capture_screenshot(app_handle: &tauri::AppHandle) -> Result<(Vec<u8>, String), String> {
    let jpeg_bytes = capture_screen(app_handle)?;
    let mut hasher = Sha256::new();
    hasher.update(&jpeg_bytes);
    let hash = hex::encode(hasher.finalize());
    Ok((jpeg_bytes, hash))
}
