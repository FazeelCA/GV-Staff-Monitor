#[cfg(target_os = "windows")]
pub fn capture_desktop() -> Result<Vec<u8>, String> {
    use std::fs;
    use std::process::Command;

    let tmp_path = std::env::temp_dir().join("gv_screenshot_capture.jpg");
    let tmp_str = tmp_path.to_string_lossy().to_string();

    // Clean up any stale file
    let _ = fs::remove_file(&tmp_path);

    let ps_script = format!(
        r#"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
$encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object {{ $_.MimeType -eq 'image/jpeg' }}
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 40)
$bitmap.Save('{}', $encoder, $encoderParams)
$graphics.Dispose()
$bitmap.Dispose()
"#,
        tmp_str.replace('\'', "''")
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
        .output()
        .map_err(|e| format!("PowerShell exec failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "PowerShell screenshot failed (exit {:?}): {}",
            output.status.code(),
            stderr
        ));
    }

    let bytes = fs::read(&tmp_path).map_err(|e| format!("Failed to read screenshot file: {e}"))?;
    let _ = fs::remove_file(&tmp_path);

    if bytes.is_empty() {
        return Err("PowerShell produced an empty screenshot file.".to_string());
    }

    log::info!(
        "[screenshot] Windows GDI capture: {} KB",
        bytes.len() / 1024
    );
    Ok(bytes)
}
