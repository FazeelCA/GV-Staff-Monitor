use sha2::{Sha256, Digest};
use hex;
use std::io::Cursor;
use image::codecs::jpeg::JpegEncoder;

/// Primary capture path for Windows: compiles and runs a tiny headless C# WinForms app.
/// This bypasses all DirectX/COM/DXGI issues (like the original PowerShell script),
/// but because it's compiled as a Windows Executable (/target:winexe), it natively
/// has no console window. This perfectly fixes both the "black box flash" AND the 
/// "CREATE_NO_WINDOW I/O hang" bugs.
#[cfg(target_os = "windows")]
fn capture_via_csharp() -> Result<Vec<u8>, String> {
    use std::process::Command;
    use std::path::PathBuf;
    
    let temp_dir = std::env::temp_dir();
    let cs_source_path = temp_dir.join("gv_capture.cs");
    let exe_path = temp_dir.join("gv_capture.exe");
    let out_jpg_path = temp_dir.join("gv_screenshot.jpg");
    
    let out_jpg_str = out_jpg_path.to_string_lossy().to_string();

    // Only compile the C# executable if it doesn't already exist (caching)
    if !exe_path.exists() {
        let cs_code = format!(
            r#"
            using System;
            using System.Drawing;
            using System.Drawing.Imaging;
            using System.Windows.Forms;
            using System.Linq;

            class Program {{
                [STAThread]
                static void Main() {{
                    try {{
                        var x = Screen.AllScreens.Min(s => s.Bounds.X);
                        var y = Screen.AllScreens.Min(s => s.Bounds.Y);
                        var w = Screen.AllScreens.Max(s => s.Bounds.X + s.Bounds.Width) - x;
                        var h = Screen.AllScreens.Max(s => s.Bounds.Y + s.Bounds.Height) - y;

                        using (var bmp = new Bitmap(w, h))
                        using (var gfx = Graphics.FromImage(bmp)) {{
                            gfx.CopyFromScreen(x, y, 0, 0, bmp.Size, CopyPixelOperation.SourceCopy);
                            bmp.Save(@"{}", ImageFormat.Jpeg);
                        }}
                    }} catch {{ }}
                }}
            }}
            "#,
            out_jpg_str.replace('\\', "\\\\")
        );
        
        std::fs::write(&cs_source_path, cs_code)
            .map_err(|e| format!("Failed to write C# source: {e}"))?;

        // Locate standard .NET Framework compiler (always present on Windows)
        let csc_path = r"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe";
        
        let compile_out = Command::new(csc_path)
            .args([
                "/nologo",
                "/target:winexe", // CRITICAL: Makes the app headless natively (no console flash)
                "/optimize+",
                &format!("/out:{}", exe_path.to_string_lossy()),
                &cs_source_path.to_string_lossy().to_string(),
            ])
            .output()
            .map_err(|e| format!("csc.exe compilation failed: {e}"))?;

        if !compile_out.status.success() {
            let stderr = String::from_utf8_lossy(&compile_out.stderr);
            let stdout = String::from_utf8_lossy(&compile_out.stdout);
            return Err(format!("C# compilation failed: {}\n{}", stdout, stderr));
        }
        
        let _ = std::fs::remove_file(&cs_source_path);
    }

    // Run the compiled headless executable
    let output = Command::new(&exe_path)
        .output() // Simple execution without CREATE_NO_WINDOW since winexe doesn't have a console
        .map_err(|e| format!("gv_capture.exe execution failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Headless capture failed: {stderr}"));
    }

    // Read the result
    let bytes = std::fs::read(&out_jpg_path)
        .map_err(|e| format!("Failed to read screenshot file from C# app: {e}"))?;

    // Clean up just the image
    let _ = std::fs::remove_file(&out_jpg_path);

    if bytes.len() < 1000 {
        return Err(format!("Screenshot file too small: {} bytes", bytes.len()));
    }

    log::info!("[screenshot] C# headless GDI+ capture: {} KB", bytes.len() / 1024);
    Ok(bytes)
}

#[cfg(not(target_os = "windows"))]
fn capture_via_csharp() -> Result<Vec<u8>, String> {
    Err("C# capture not available on this platform".to_string())
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
    // Try C# GDI+ first on Windows (most reliable, completely headless)
    let jpeg_bytes = match capture_via_csharp() {
        Ok(bytes) => {
            log::info!("[screenshot] Using C# GDI+ capture path");
            bytes
        }
        Err(cs_err) => {
            log::warn!("[screenshot] C# capture failed: {cs_err}, trying Rust crate...");
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
