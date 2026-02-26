#[cfg(target_os = "windows")]
pub fn capture_desktop() -> Result<Vec<u8>, String> {
    use std::{fs, process::Command, thread, time::Duration};
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let exe = find_capture_path().ok_or_else(|| {
        "gv_capture.exe not found (the internal C# sidecar is missing)".to_string()
    })?;
    let output_path = temp_screenshot_path();

    // Clean up any stale file
    let _ = fs::remove_file(&output_path);

    log::info!("[screenshot] Spawning native C# sidecar: {}", exe.display());

    let mut cmd = Command::new(&exe);
    cmd.arg(&output_path);
    cmd.creation_flags(CREATE_NO_WINDOW);

    let status = cmd
        .status()
        .map_err(|e| format!("gv_capture launch failed ({}): {e}", exe.display()))?;

    if !status.success() {
        return Err(format!(
            "gv_capture exited with status {:?} (exe: {})",
            status.code(),
            exe.display()
        ));
    }

    let mut last_err = "gv_capture produced no output file".to_string();
    for _ in 0..15 { // Give it max ~1 second total to flush to disk
        match fs::read(&output_path) {
            Ok(bytes) if !bytes.is_empty() => {
                let _ = fs::remove_file(&output_path);
                log::info!(
                    "[screenshot] Captured natively via C# Sidecar: {} KB",
                    bytes.len() / 1024
                );
                return Ok(bytes);
            }
            Ok(_) => {
                last_err = "gv_capture wrote an empty image".to_string();
            }
            Err(e) => {
                last_err = format!("failed to read gv_capture output: {e}");
            }
        }
        thread::sleep(Duration::from_millis(60));
    }

    let _ = fs::remove_file(&output_path);
    Err(last_err)
}

#[cfg(target_os = "windows")]
fn find_capture_path() -> Option<std::path::PathBuf> {
    use std::path::PathBuf;

    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join("gv_capture.exe"));
            candidates.push(exe_dir.join("resources").join("gv_capture.exe"));
            candidates.push(exe_dir.join("resources").join("bin").join("gv_capture.exe"));
        }
    }

    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("bin")
            .join("gv_capture.exe"),
    );

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
