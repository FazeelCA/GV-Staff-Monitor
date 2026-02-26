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

    let mut buffer = Cursor::new(Vec::new());
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

// ─────────────────────────────────────────────────────────────────────────────
// Windows: Utilize Scrap (Native DXGI Desktop Duplication)
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
pub fn capture_screen(_app_handle: &tauri::AppHandle) -> Result<Vec<u8>, String> {
    use std::env;
    use std::fs;
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    let temp_dir = env::temp_dir();
    let bat_path = temp_dir.join("gv_capture_v3.bat");
    let out_path = temp_dir.join("gv_capture_out.png"); // Crucial: Ask C# for PNG to bypass buggy Optimus JPEG codec
    let manifest_path = temp_dir.join("app.manifest");

    // We use a predefined batch file containing the C# code
    let bat_content = include_bytes!("gv_capture.bat");
    fs::write(&bat_path, bat_content).map_err(|e| format!("Failed to write bat: {}", e))?;

    let manifest_content = include_bytes!("app.manifest");
    fs::write(&manifest_path, manifest_content)
        .map_err(|e| format!("Failed to write manifest: {}", e))?;

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 1: List Displays (Mimicking Workfolio JS `listDisplays()`)
    // ─────────────────────────────────────────────────────────────────────────
    let list_output = Command::new("cmd.exe")
        .current_dir(&temp_dir)
        .args(&["/C", bat_path.to_str().unwrap(), "/list"])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("Failed to list displays: {}", e))?;

    let stdout = String::from_utf8_lossy(&list_output.stdout);
    
    // Workfolio parsing: they find the first matching line that looks like: \\.\DISPLAY1;0;1920;1080;0
    // We just want to extract the FIRST primary display string.
    let mut primary_device_name = "\\\\.\\DISPLAY1".to_string(); // fallback
    for line in stdout.lines() {
        if line.starts_with("\\\\.\\DISPLAY") {
            let parts: Vec<&str> = line.split(';').collect();
            if parts.len() > 0 {
                primary_device_name = parts[0].to_string();
                break;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2: Capture Exact Display Buffer (Mimicking Workfolio JS `exec ... /d "..."`)
    // ─────────────────────────────────────────────────────────────────────────
    let status = Command::new("cmd.exe")
        .current_dir(&temp_dir)
        .args(&[
            "/C",
            bat_path.to_str().unwrap(),
            out_path.to_str().unwrap(),
            "/d",
            &primary_device_name,
        ])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .status()
        .map_err(|e| format!("Failed to execute C# batch script: {}", e))?;

    if !status.success() {
        return Err(format!(
            "C# Batch script compiler failed with exit status: {}",
            status
        ));
    }

    // Read the resulting PNG bytes
    let png_bytes =
        fs::read(&out_path).map_err(|e| format!("Failed to read captured image buffer: {}", e))?;

    // Cleanup the raw PNG file
    let _ = fs::remove_file(&out_path);

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 3: Jimp Pipeline: PNG -> Scale 720p -> JPG
    // ─────────────────────────────────────────────────────────────────────────
    let mut img = image::load_from_memory(&png_bytes)
        .map_err(|e| format!("Failed to parse raw PNG capture from C#: {}", e))?;

    // Workfolio exact logic: limit height to 720p
    if img.height() > 720 {
        let aspect_ratio = img.width() as f32 / img.height() as f32;
        let new_width = (720.0 * aspect_ratio) as u32;
        img = img.resize_exact(new_width, 720, image::imageops::FilterType::Triangle);
    }

    // Workfolio exact logic: compress to JPG at 50% quality
    let mut buffer = std::io::Cursor::new(Vec::new());
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buffer, 50);
    encoder
        .encode(
            img.as_bytes(),
            img.width(),
            img.height(),
            img.color().into(),
        )
        .map_err(|e| format!("Software JPEG encode failed: {}", e))?;

    Ok(buffer.into_inner())
}

// ─────────────────────────────────────────────────────────────────────────────
// macOS/Linux: Fallback to xcap
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(not(target_os = "windows"))]
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
