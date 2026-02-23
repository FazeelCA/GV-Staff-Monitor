use sha2::{Sha256, Digest};
use hex;
use screenshots::Screen;
use image::{DynamicImage, RgbaImage, imageops};
use std::io::Cursor;
use image::codecs::jpeg::JpegEncoder;

/// Captures all active screens sequentially, stitches them horizontally,
/// and returns lightweight JPEG bytes + SHA256 Hash.
pub fn capture_screenshot() -> Result<(Vec<u8>, String), String> {
    let screens = Screen::all().map_err(|e| format!("Capture init error: {e}"))?;

    let mut captures = Vec::new();
    let mut total_width = 0;
    let mut max_height = 0;

    // Capture every screen available to catch dual-screen setups
    for screen in screens {
        if let Ok(captured) = screen.capture() {
            let width = captured.width();
            let height = captured.height();
            
            // Extract and perfectly align RGBA matrix across `image` crate versions
            let raw_rgba: Vec<u8> = captured.into_raw();
            if let Some(rgba_image) = RgbaImage::from_raw(width, height, raw_rgba) {
                total_width += width;
                if height > max_height {
                    max_height = height;
                }
                captures.push(rgba_image);
            }
        }
    }

    if captures.is_empty() {
        return Err("No active displays detected capable of rendering frames.".to_string());
    }

    // Horizontally stitch screens side-by-side
    let mut stitched = RgbaImage::new(total_width, max_height);
    let mut current_x = 0;
    for cap in captures.iter() {
        imageops::overlay(&mut stitched, cap, current_x as i64, 0);
        current_x += cap.width();
    }

    // Convert RGBA → RGB for JPEG
    let rgb_image = DynamicImage::ImageRgba8(stitched).to_rgb8();

    let mut hasher = Sha256::new();
    hasher.update(rgb_image.as_raw());
    let hash = hex::encode(hasher.finalize());

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
        "[screenshot] Stitched {} displays {}x{} @ {} KB",
        captures.len(),
        total_width,
        max_height,
        bytes.len() / 1024
    );
    
    Ok((bytes, hash))
}
