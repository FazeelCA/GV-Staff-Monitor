#[cfg(target_os = "windows")]
pub fn capture_desktop(app_handle: &tauri::AppHandle) -> Result<Vec<u8>, String> {
    use std::{fs, thread, time::Duration};
    use tauri_plugin_shell::ShellExt;
    use tauri_plugin_shell::process::CommandEvent;

    let output_path = temp_screenshot_path();

    // Clean up any stale file
    let _ = fs::remove_file(&output_path);

    log::info!("[screenshot] Spawning Tauri sidecar wrapper for gv_capture");

    // "new_sidecar" requires the string exactly as defined in externalBin without the suffix
    let sidecar_command = app_handle.shell().sidecar("gv_capture")
        .map_err(|e| format!("Failed to initialize gv_capture sidecar module: {e}"))?
        .args([output_path.as_os_str()]);

    let (mut rx, mut _child) = sidecar_command.spawn()
        .map_err(|e| format!("gv_capture runtime launch failed: {e}"))?;

    // Wait for the sidecar process to exit
    let mut success = false;
    while let Some(event) = tauri::async_runtime::block_on(rx.recv()) {
        if let CommandEvent::Terminated(payload) = event {
            success = payload.code == Some(0);
            break;
        }
    }

    if !success {
        return Err("gv_capture runtime crashed or returned non-zero code.".to_string());
    }

    let mut last_err = "gv_capture produced no output file".to_string();
    for _ in 0..15 { // Give it max ~1 second total to flush to disk
        match fs::read(&output_path) {
            Ok(bytes) if !bytes.is_empty() => {
                let _ = fs::remove_file(&output_path);
                log::info!(
                    "[screenshot] Captured natively via officially-bundled C# Sidecar: {} KB",
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
fn temp_screenshot_path() -> std::path::PathBuf {
    use std::time::{SystemTime, UNIX_EPOCH};

    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("gv_staff_capture_{millis}.jpg"))
}
