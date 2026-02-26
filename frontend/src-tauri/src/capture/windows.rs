#[cfg(target_os = "windows")]
pub fn capture_desktop() -> Result<Vec<u8>, String> {
    use xcap::Monitor;

    let monitors = Monitor::all().map_err(|e| format!("Failed to list monitors: {e}"))?;

    let monitor = monitors
        .into_iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .ok_or_else(|| "No primary monitor found".to_string())?;

    let image = monitor
        .capture_image()
        .map_err(|e| format!("Failed to capture screen: {e}"))?;

    let mut jpeg = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 40)
        .encode(
            image.as_raw(),
            image.width(),
            image.height(),
            image::ColorType::Rgba8.into(),
        )
        .map_err(|e| format!("JPEG encode failed: {e}"))?;

    log::info!(
        "[screenshot] xcap capture: {}x{} → {} KB",
        image.width(),
        image.height(),
        jpeg.len() / 1024
    );

    Ok(jpeg)
}
