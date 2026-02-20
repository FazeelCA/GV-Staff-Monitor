use sha2::{Sha256, Digest};
use hex;
use xcap::Monitor;
use image::DynamicImage;
use std::io::Cursor;
use image::codecs::jpeg::JpegEncoder;

/// Captures the primary monitor and returns JPEG bytes compressed to ~<200 KB + SHA256 Hash.
pub fn capture_screenshot() -> Result<(Vec<u8>, String), String> {
    // Grab all monitors, prefer primary
    let monitors = Monitor::all().map_err(|e| format!("Monitor error: {e}"))?;

    let monitor = monitors
        .into_iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .or_else(|| Monitor::all().ok()?.into_iter().next())
        .ok_or_else(|| "No monitor found".to_string())?;

    // Capture a frame — xcap 0.8 returns RgbaImage
    let rgba_image = monitor
        .capture_image()
        .map_err(|e| format!("Capture error: {e}"))?;

    // Convert to DynamicImage for encoding
    let dynamic = DynamicImage::ImageRgba8(rgba_image);

    // Convert RGBA → RGB (JPEG does not support alpha)
    let rgb_image = dynamic.to_rgb8();

    // Compute SHA256 Hash of raw pixels (detects identical screens instantly)
    let mut hasher = Sha256::new();
    hasher.update(rgb_image.as_raw());
    let hash = hex::encode(hasher.finalize());

    // Encode to JPEG with quality 60 (reliably <200 KB for typical HD screens)
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
        "[screenshot] Captured {} KB | Hash: {:.8}...",
        bytes.len() / 1024,
        hash
    );
    Ok((bytes, hash))
}
