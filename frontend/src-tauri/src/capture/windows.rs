#[cfg(target_os = "windows")]
pub fn capture_desktop() -> Result<Vec<u8>, String> {
    match capture_with_nircmd() {
        Ok(bytes) => Ok(bytes),
        Err(err) => {
            log::warn!("[screenshot] nircmd capture failed, falling back to Rust backend: {err}");
            capture_with_screenshots()
        }
    }
}

#[cfg(target_os = "windows")]
fn capture_with_nircmd() -> Result<Vec<u8>, String> {
    use std::{fs, process::Command, thread, time::Duration};

    #[cfg(target_os = "windows")]
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let exe = find_nircmd_path().ok_or_else(|| {
        "nircmd.exe not found (checked GV_SCREENSHOT_EXE, app resources, and PATH)".to_string()
    })?;
    let output_path = temp_screenshot_path();

    let mut cmd = Command::new(&exe);
    cmd.arg("savescreenshot").arg(&output_path);
    cmd.creation_flags(CREATE_NO_WINDOW);

    let status = cmd
        .status()
        .map_err(|e| format!("nircmd launch failed ({}): {e}", exe.display()))?;

    if !status.success() {
        return Err(format!(
            "nircmd exited with status {:?} (exe: {})",
            status.code(),
            exe.display()
        ));
    }

    let mut last_err = "nircmd produced no output file".to_string();
    for _ in 0..8 {
        match fs::read(&output_path) {
            Ok(bytes) if !bytes.is_empty() => {
                let _ = fs::remove_file(&output_path);
                log::info!(
                    "[screenshot] Captured via nircmd: {} KB ({})",
                    bytes.len() / 1024,
                    exe.display()
                );
                return Ok(bytes);
            }
            Ok(_) => {
                last_err = "nircmd wrote an empty image".to_string();
            }
            Err(e) => {
                last_err = format!("failed to read nircmd output: {e}");
            }
        }
        thread::sleep(Duration::from_millis(60));
    }

    let _ = fs::remove_file(&output_path);
    Err(last_err)
}

#[cfg(target_os = "windows")]
fn find_nircmd_path() -> Option<std::path::PathBuf> {
    use std::path::PathBuf;

    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(path) = std::env::var("GV_SCREENSHOT_EXE") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            candidates.push(PathBuf::from(trimmed));
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join("nircmd.exe"));
            candidates.push(exe_dir.join("resources").join("nircmd.exe"));
            candidates.push(exe_dir.join("resources").join("bin").join("nircmd.exe"));
        }
    }

    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("bin")
            .join("nircmd.exe"),
    );

    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            candidates.push(dir.join("nircmd.exe"));
        }
    }

    candidates.into_iter().find(|candidate| candidate.is_file())
}

#[cfg(target_os = "windows")]
fn temp_screenshot_path() -> std::path::PathBuf {
    use std::time::{SystemTime, UNIX_EPOCH};

    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("gv_staff_capture_{millis}.jpg"))
}

#[cfg(target_os = "windows")]
fn capture_with_screenshots() -> Result<Vec<u8>, String> {
    use image::ImageEncoder;
    use screenshots::Screen;

    log::info!("[screenshot] Starting capture via `screenshots` crate...");

    let mut screens = Screen::all().map_err(|e| format!("Failed to fetch screens: {e}"))?;

    if screens.is_empty() {
        return Err("No transparent screens found attached to desktop".to_string());
    }

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

    let capture_buffer = primary
        .capture()
        .map_err(|e| format!("Hardware frame extraction error: {e}"))?;

    let width = capture_buffer.width();
    let height = capture_buffer.height();
    let rgba = capture_buffer.as_raw();

    let mut rgb = Vec::with_capacity((width * height * 3) as usize);
    for pixel in rgba.chunks_exact(4) {
        rgb.push(pixel[0]);
        rgb.push(pixel[1]);
        rgb.push(pixel[2]);
    }

    let mut jpeg = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 40)
        .write_image(&rgb, width, height, image::ColorType::Rgb8.into())
        .map_err(|e| format!("JPEG encoding panic: {e}"))?;

    log::info!(
        "[screenshot] Rust capture success: {}x{} -> {} KB",
        width,
        height,
        jpeg.len() / 1024
    );

    Ok(jpeg)
}
