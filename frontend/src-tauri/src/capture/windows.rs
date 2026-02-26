#[cfg(target_os = "windows")]
pub fn capture_desktop() -> Result<Vec<u8>, String> {
    use image::ImageEncoder;
    use screenshots::Screen;

    log::info!("[screenshot] Starting capture via `screenshots` crate...");

    let screens = Screen::all().map_err(|e| format!("Failed to fetch screens: {e}"))?;

    if screens.is_empty() {
        return Err("No transparent screens found attached to desktop".to_string());
    }

    // Get the primary screen logically mapping to the main display hook
    let mut primary_idx = 0;
    for (i, s) in screens.iter().enumerate() {
        if s.display_info.is_primary {
            primary_idx = i;
            break;
        }
    }
    let primary = screens.remove(primary_idx);

    log::info!(
        "[screenshot] Capturing screen ID: {} ({}x{})",
        primary.display_info.id,
        primary.display_info.width,
        primary.display_info.height
    );

    // This internal implementation flawlessly handles row pitch padding
    // switching smoothly between DXGI Desktop Duplication and GDI backends natively.
    let capture_buffer = primary
        .capture()
        .map_err(|e| format!("Hardware frame extraction error: {e}"))?;

    let width = capture_buffer.width();
    let height = capture_buffer.height();

    // We get absolutely pristine, stride-corrected RGBA bytes.
    let rgba = capture_buffer.as_raw();

    // Convert to RGB for JPEG encoding natively without striding drift
    let mut rgb = Vec::with_capacity((width * height * 3) as usize);
    for pixel in rgba.chunks_exact(4) {
        rgb.push(pixel[0]); // R
        rgb.push(pixel[1]); // G
        rgb.push(pixel[2]); // B
    }

    // Compress to 40-quality JPEG precisely via memory buffer
    let mut jpeg = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 40)
        .write_image(&rgb, width, height, image::ColorType::Rgb8.into())
        .map_err(|e| format!("JPEG encoding panic: {e}"))?;

    log::info!(
        "[screenshot] Core capture pipeline success: {}x{} -> {} KB",
        width,
        height,
        jpeg.len() / 1024
    );

    Ok(jpeg)
}
