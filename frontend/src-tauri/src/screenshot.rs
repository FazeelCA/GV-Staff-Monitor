use image::codecs::jpeg::JpegEncoder;
use log;
use sha2::{Digest, Sha256};
use std::io::Cursor;
use std::thread;
use std::time::Duration; // Added for log::warn!

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
    use image::{Rgba, RgbaImage};
    use scrap::{Capturer, Display};

    let display = match Display::primary() {
        Ok(d) => d,
        Err(e) => {
            log::warn!("Scrap DXGI failed to find primary display: {e}, falling back to xcap");
            return capture_screen_xcap();
        }
    };

    let mut capturer = match Capturer::new(display) {
        Ok(c) => c,
        Err(e) => {
            log::warn!("Scrap DXGI failed to initialize capturer: {e}, falling back to xcap");
            return capture_screen_xcap();
        }
    };

    let width = capturer.width();
    let height = capturer.height();

    // Windows Desktop Duplication API requires polling until a frame is ready
    let mut frame_data = None;
    for _ in 0..20 {
        // Retry loop (Wait up to ~1 sec)
        match capturer.frame() {
            Ok(buffer) => {
                frame_data = Some(buffer.to_vec());
                break;
            }
            Err(error) => {
                if error.kind() == std::io::ErrorKind::WouldBlock {
                    thread::sleep(Duration::from_millis(50));
                    continue;
                } else {
                    log::warn!("Scrap DXGI capture error: {error}, falling back to xcap");
                    return capture_screen_xcap();
                }
            }
        }
    }

    let frame_bytes = match frame_data {
        Some(bytes) => bytes,
        None => {
            log::warn!("Scrap DXGI timed out waiting for frame, falling back to xcap");
            return capture_screen_xcap();
        }
    };

    // Scrap returns BGRA. Convert to RGBA for the JPEG encoder.
    let mut rgba_image = RgbaImage::new(width as u32, height as u32);
    let stride = frame_bytes.len() / height;

    for y in 0..height {
        for x in 0..width {
            let offset = y * stride + x * 4;
            // BGRA layout mapping
            let b = frame_bytes[offset];
            let g = frame_bytes[offset + 1];
            let r = frame_bytes[offset + 2];
            let a = frame_bytes[offset + 3];
            rgba_image.put_pixel(x as u32, y as u32, Rgba([r, g, b, a]));
        }
    }

    let mut buffer = Cursor::new(Vec::new());

    let mut encoder = JpegEncoder::new_with_quality(&mut buffer, 40);
    encoder
        .encode(
            rgba_image.as_raw(),
            width as u32,
            height as u32,
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|e| format!("JPEG encode failed: {e}"))?;

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
