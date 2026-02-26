#[cfg(not(target_os = "windows"))]
pub fn capture_desktop() -> Result<Vec<u8>, String> {
    use std::fs;
    use std::process::Command;

    let tmp_path = "/tmp/gv_screenshot_capture.jpg";
    let _ = fs::remove_file(tmp_path); // clean up any stale file

    let status = Command::new("screencapture")
        .args([
            "-x", // silent (no shutter sound)
            "-t", "jpg", // JPEG output
            tmp_path,
        ])
        .status()
        .map_err(|e| format!("screencapture exec failed: {e}"))?;

    if !status.success() {
        return Err(format!(
            "screencapture exited {:?} — Screen Recording permission may be denied.",
            status.code()
        ));
    }

    let bytes = fs::read(tmp_path).map_err(|e| format!("Failed to read screenshot file: {e}"))?;
    let _ = fs::remove_file(tmp_path);

    if bytes.is_empty() {
        return Err(
            "screencapture produced an empty file — Screen Recording permission likely denied."
                .to_string(),
        );
    }

    log::info!(
        "[screenshot] macOS screencapture: {} KB",
        bytes.len() / 1024
    );
    Ok(bytes)
}
