use sha2::{Sha256, Digest};
use hex;
use std::io::Cursor;
use image::codecs::jpeg::JpegEncoder;

/// Primary capture path for Windows: uses PowerShell + .NET System.Drawing (GDI+).
/// This bypasses ALL DXGI/COM/DirectX issues and works on every Windows machine,
/// including RDP sessions, locked screens, any GPU driver, any DPI scaling.
#[cfg(target_os = "windows")]
fn capture_via_powershell() -> Result<Vec<u8>, String> {
    use std::process::Command;
    
    let temp_path = std::env::temp_dir().join("gv_screenshot.jpg");
    let temp_str = temp_path.to_string_lossy().to_string();

    // PowerShell script that captures ALL screens using .NET GDI+
    let ps_script = format!(
        r#"
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $screens = [System.Windows.Forms.Screen]::AllScreens
        $minX = ($screens | ForEach-Object {{ $_.Bounds.X }} | Measure-Object -Minimum).Minimum
        $minY = ($screens | ForEach-Object {{ $_.Bounds.Y }} | Measure-Object -Minimum).Minimum
        $maxX = ($screens | ForEach-Object {{ $_.Bounds.X + $_.Bounds.Width }} | Measure-Object -Maximum).Maximum
        $maxY = ($screens | ForEach-Object {{ $_.Bounds.Y + $_.Bounds.Height }} | Measure-Object -Maximum).Maximum
        $totalWidth = $maxX - $minX
        $totalHeight = $maxY - $minY
        $bmp = New-Object Drawing.Bitmap([int]$totalWidth, [int]$totalHeight)
        $graphics = [Drawing.Graphics]::FromImage($bmp)
        $graphics.CopyFromScreen([int]$minX, [int]$minY, 0, 0, $bmp.Size)
        $graphics.Dispose()
        $bmp.Save('{}', [Drawing.Imaging.ImageFormat]::Jpeg)
        $bmp.Dispose()
        Write-Output "OK"
        "#,
        temp_str.replace('\\', "\\\\")
    );

    let ps_path = std::env::temp_dir().join("gv_screenshot.ps1");
    let vbs_path = std::env::temp_dir().join("gv_screenshot.vbs");
    
    // Save the PowerShell script to a file
    std::fs::write(&ps_path, ps_script)
        .map_err(|e| format!("Failed to write PS script: {e}"))?;

    // Create a VBScript wrapper that runs the PS script completely invisibly 
    // This entirely avoids the CREATE_NO_WINDOW hanging bugs
    let vbs_script = format!(
        r#"CreateObject("Wscript.Shell").Run "powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{}""", 0, True"#,
        ps_path.to_string_lossy()
    );
    std::fs::write(&vbs_path, vbs_script)
        .map_err(|e| format!("Failed to write VBS wrapper: {e}"))?;

    // Execute via cscript
    let mut cmd = Command::new("cscript");
    cmd.args(["//nologo", &vbs_path.to_string_lossy().to_string()]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd.output()
        .map_err(|e| format!("VBS launch failed: {e}"))?;

    // Clean up scripts
    let _ = std::fs::remove_file(&ps_path);
    let _ = std::fs::remove_file(&vbs_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("VBS/PowerShell capture failed: {stderr}"));
    }

    let bytes = std::fs::read(&temp_path)
        .map_err(|e| format!("Failed to read screenshot file: {e}"))?;

    // Clean up temp file
    let _ = std::fs::remove_file(&temp_path);

    if bytes.len() < 1000 {
        return Err(format!("Screenshot file too small: {} bytes", bytes.len()));
    }

    log::info!("[screenshot] PowerShell GDI+ capture: {} KB", bytes.len() / 1024);
    Ok(bytes)
}

#[cfg(not(target_os = "windows"))]
fn capture_via_powershell() -> Result<Vec<u8>, String> {
    Err("PowerShell not available on this platform".to_string())
}

/// Fallback capture using the `screenshots` Rust crate (DXGI on Windows, native on Mac/Linux)
fn capture_via_rust_crate() -> Result<Vec<u8>, String> {
    use screenshots::Screen;
    use image::DynamicImage;

    let screens = Screen::all().map_err(|e| format!("Screen::all error: {e}"))?;

    if screens.is_empty() {
        return Err("No screens found".to_string());
    }

    let mut last_err = String::from("No screens captured");
    for screen in screens {
        match screen.capture() {
            Ok(captured) => {
                let width = captured.width();
                let height = captured.height();
                let raw_rgba: Vec<u8> = captured.into_raw();

                let rgba_image = image::RgbaImage::from_raw(width, height, raw_rgba)
                    .ok_or_else(|| "RgbaImage::from_raw failed".to_string())?;

                let rgb_image = DynamicImage::ImageRgba8(rgba_image).to_rgb8();

                let mut buf = Cursor::new(Vec::new());
                let mut encoder = JpegEncoder::new_with_quality(&mut buf, 60);
                encoder
                    .encode(
                        rgb_image.as_raw(),
                        rgb_image.width(),
                        rgb_image.height(),
                        image::ExtendedColorType::Rgb8,
                    )
                    .map_err(|e| format!("Encode error: {e}"))?;

                let bytes = buf.into_inner();
                log::info!(
                    "[screenshot] Rust crate capture: {}x{} @ {} KB",
                    width, height, bytes.len() / 1024
                );
                return Ok(bytes);
            }
            Err(e) => {
                last_err = format!("Screen capture error: {e}");
                log::warn!("[screenshot] Skipping screen: {last_err}");
                continue;
            }
        }
    }

    Err(last_err)
}

/// Main entry point: tries PowerShell GDI+ first (Windows), falls back to Rust crate.
/// Returns JPEG bytes + SHA256 hash.
pub fn capture_screenshot() -> Result<(Vec<u8>, String), String> {
    // Try PowerShell GDI+ first on Windows (most reliable)
    let jpeg_bytes = match capture_via_powershell() {
        Ok(bytes) => {
            log::info!("[screenshot] Using PowerShell GDI+ capture path");
            bytes
        }
        Err(ps_err) => {
            log::warn!("[screenshot] PowerShell failed: {ps_err}, trying Rust crate...");
            // Fall back to screenshots crate
            capture_via_rust_crate()?
        }
    };

    // Hash the JPEG bytes
    let mut hasher = Sha256::new();
    hasher.update(&jpeg_bytes);
    let hash = hex::encode(hasher.finalize());

    Ok((jpeg_bytes, hash))
}
