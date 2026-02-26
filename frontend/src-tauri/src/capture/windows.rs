#[cfg(target_os = "windows")]
pub fn capture_desktop() -> Result<Vec<u8>, String> {
    use std::fs;
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let tmp_path = std::env::temp_dir().join("gv_screenshot_final.jpg");
    let tmp_str = tmp_path.to_string_lossy().to_string();

    let _ = fs::remove_file(&tmp_path);

    // This script accomplishes 3 things using purely native Windows libraries:
    // 1. Enforces DPI awareness so physical pixel dimensions are used (fixes cropping).
    // 2. Extracts pixels specifically from the Primary Monitor (fixes multi-monitor coordinate bounds).
    // 3. Encodes directly to JPEG securely inside .NET (bypasses all Rust image crate stride bugs).
    let ps_script = format!(
        r#"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class DpiHelper {{
    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();
}}
"@
[DpiHelper]::SetProcessDPIAware()

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($screen.Bounds.X, $screen.Bounds.Y, 0, 0, $bitmap.Size)

$encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object {{ $_.MimeType -eq 'image/jpeg' }}
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 40L)
$bitmap.Save('{}', $encoder, $encoderParams)

$graphics.Dispose()
$bitmap.Dispose()
"#,
        tmp_str.replace('\'', "''")
    );

    log::info!("[screenshot] Executing native .NET Capture engine to bypass Rust encoding bugs...");

    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            &ps_script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("PowerShell exec failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("PowerShell failed: {}", stderr));
    }

    let bytes = fs::read(&tmp_path).map_err(|e| format!("Failed to read JPEG: {e}"))?;
    let _ = fs::remove_file(&tmp_path);

    if bytes.is_empty() {
        return Err("Produced completely empty JPEG".to_string());
    }

    log::info!(
        "[screenshot] .NET Capture success: {} KB",
        bytes.len() / 1024
    );
    Ok(bytes)
}
