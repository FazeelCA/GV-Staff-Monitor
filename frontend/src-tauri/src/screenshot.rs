use sha2::{Sha256, Digest};
use hex;
use xcap::Monitor;
use image::DynamicImage;
use std::io::Cursor;
use image::codecs::jpeg::JpegEncoder;

/// Captures the primary monitor and returns JPEG bytes + SHA256 Hash.
/// Uses the `xcap` crate which efficiently captures displays across Windows/Mac/Linux
/// with stable fallbacks for DXGI hybrid graphics on Windows.
pub fn capture_screenshot() -> Result<(Vec<u8>, String), String> {
    // Get all monitors; take the first (primary) one
    let monitors = Monitor::all().map_err(|e| format!("Monitor error: {e}"))?;
    let monitor = monitors
        .into_iter()
        .next()
        .ok_or_else(|| "No monitor found".to_string())?;

    // Capture the full screen — returns image buffer
    let captured = monitor
        .capture_image()
        .map_err(|e| format!("Capture error: {e}"))?;

    // Extract dimensions and raw RGBA pixel bytes
    // use_raw() / into_raw() avoids any image-version type conflicts
    let width = captured.width();
    let height = captured.height();
    let raw_rgba: Vec<u8> = captured.into_raw();

    // Re-wrap into image 0.25's RgbaImage via raw bytes — avoids cross-version type mismatch
    let rgba_image = image::RgbaImage::from_raw(width, height, raw_rgba)
        .ok_or_else(|| "Failed to build RgbaImage from screen capture".to_string())?;

    // Convert RGBA → RGB (JPEG does not support alpha channel)
    let rgb_image = DynamicImage::ImageRgba8(rgba_image).to_rgb8();

    // Compute SHA256 hash of raw pixels (detects identical/static screens)
    let mut hasher = Sha256::new();
    hasher.update(rgb_image.as_raw());
    let hash = hex::encode(hasher.finalize());

    // Encode to JPEG at quality 60 (reliably <200 KB for typical HD screens)
    let mut buf = Cursor::new(Vec::new());
    let mut encoder = JpegEncoder::new_with_quality(&mut buf, 60);
    encoder
        .encode(
            rgb_image.as_raw(),
            rgb_image.width(),
            rgb_image.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| format!("Encode error: {e}"))?;

    let bytes = buf.into_inner();
    log::info!(
        "[screenshot] Captured {}x{} @ {} KB | Hash: {:.8}...",
        width,
        height,
        bytes.len() / 1024,
        hash
    );
    Ok((bytes, hash))
}
