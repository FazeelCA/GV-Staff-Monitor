#[cfg(target_os = "windows")]
pub fn capture_desktop() -> Result<Vec<u8>, String> {
    use image::ImageEncoder;
    use xcap::Monitor;

    log::info!("[screenshot] Starting xcap capture...");

    let monitors = Monitor::all().map_err(|e| format!("Failed to list monitors: {e}"))?;

    log::info!("[screenshot] Found {} monitors", monitors.len());

    let monitor = monitors
        .into_iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .ok_or_else(|| "No primary monitor found".to_string())?;

    log::info!("[screenshot] Capturing primary monitor...");

    let image = monitor
        .capture_image()
        .map_err(|e| format!("Failed to capture screen: {e}"))?;

    let width = image.width();
    let height = image.height();

    log::info!(
        "[screenshot] Captured {}x{}, converting RGBA→RGB...",
        width,
        height
    );

    // JPEG does NOT support alpha channel (RGBA).
    // Convert RGBA → RGB by dropping the alpha byte.
    let rgba = image.as_raw();
    let mut rgb = Vec::with_capacity((width * height * 3) as usize);
    for pixel in rgba.chunks_exact(4) {
        rgb.push(pixel[0]); // R
        rgb.push(pixel[1]); // G
        rgb.push(pixel[2]); // B
    }

    let mut jpeg = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 40)
        .write_image(&rgb, width, height, image::ColorType::Rgb8)
        .map_err(|e| format!("JPEG encode failed: {e}"))?;

    log::info!(
        "[screenshot] xcap capture complete: {}x{} → {} KB",
        width,
        height,
        jpeg.len() / 1024
    );

    Ok(jpeg)
}
