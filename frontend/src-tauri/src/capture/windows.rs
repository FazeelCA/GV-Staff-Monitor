#[cfg(target_os = "windows")]
pub fn capture_desktop() -> Result<Vec<u8>, String> {
    use image::ImageEncoder;
    use std::fs;
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    // The 40KB NirCmd utility baked directly into our app executable
    const NIRCMD_BYTES: &[u8] = include_bytes!("nircmd.exe");
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let temp_dir = std::env::temp_dir();
    let nircmd_path = temp_dir.join("gv_nircmd_capture.exe");
    let screenshot_path = temp_dir.join("gv_screenshot.png");

    let nircmd_str = nircmd_path.to_string_lossy().to_string();
    let screenshot_str = screenshot_path.to_string_lossy().to_string();

    // Ensure clean state
    let _ = fs::remove_file(&nircmd_path);
    let _ = fs::remove_file(&screenshot_path);

    // Write the native C++ exe to temp storage
    fs::write(&nircmd_path, NIRCMD_BYTES).map_err(|e| format!("Failed to extract NirCmd: {e}"))?;

    log::info!("[screenshot] Executing standalone NirCmd process...");

    // Execute nircmd.exe as a completely separate process (immune to Tauri GPU bugs)
    let output = Command::new(&nircmd_str)
        .args(["savescreenshot", &screenshot_str])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to execute NirCmd: {e}"))?;

    // Cleanup the portable exe immediately
    let _ = fs::remove_file(&nircmd_path);

    if !output.status.success() {
        return Err(format!(
            "NirCmd failed with status: {:?}",
            output.status.code()
        ));
    }

    // Read the screenshot png into memory
    let png_bytes =
        fs::read(&screenshot_path).map_err(|e| format!("Failed to read NirCmd screenshot: {e}"))?;

    // Cleanup the screenshot file
    let _ = fs::remove_file(&screenshot_path);

    if png_bytes.is_empty() {
        return Err("NirCmd produced an empty screenshot".to_string());
    }

    log::info!(
        "[screenshot] NirCmd PNG captured: {} KB, compressing...",
        png_bytes.len() / 1024
    );

    // Decode the native PNG and re-encode to 40-quality JPEG
    let captured_image = image::load_from_memory(&png_bytes)
        .map_err(|e| format!("Failed to decode NirCmd PNG: {e}"))?;

    let rgb_image = captured_image.into_rgb8();
    let width = rgb_image.width();
    let height = rgb_image.height();

    let mut jpeg = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 40)
        .write_image(
            rgb_image.as_raw(),
            width,
            height,
            image::ColorType::Rgb8.into(),
        )
        .map_err(|e| format!("JPEG encode failed: {e}"))?;

    log::info!(
        "[screenshot] NirCmd capture success: {}x{} → {} KB",
        width,
        height,
        jpeg.len() / 1024
    );

    Ok(jpeg)
}
