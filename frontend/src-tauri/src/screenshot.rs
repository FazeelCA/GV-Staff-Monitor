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

    let rgb_image = image::DynamicImage::ImageRgba8(image).to_rgb8();

    let mut buffer = Cursor::new(Vec::new());
    let mut encoder = JpegEncoder::new_with_quality(&mut buffer, 40);
    encoder
        .encode(
            rgb_image.as_raw(),
            rgb_image.width(),
            rgb_image.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| format!("JPEG encode failed: {e}"))?;

    Ok(buffer.into_inner())
}

// ─────────────────────────────────────────────────────────────────────────────
// Windows: Utilize Scrap (Native DXGI Desktop Duplication)
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
pub fn capture_screen(_app_handle: &tauri::AppHandle) -> Result<Vec<u8>, String> {
    use scrap::{Capturer, Display};
    use std::thread;
    use std::time::{Duration, Instant};

    let display = Display::primary().map_err(|e| format!("Scrap primary display error: {}", e))?;
    let mut capturer =
        Capturer::new(display).map_err(|e| format!("Scrap capturer error: {}", e))?;

    let width = capturer.width() as usize;
    let height = capturer.height() as usize;

    // We must poll for a frame, since DXGI only updates when the screen changes
    // Allow up to 2 seconds for a frame to composite
    let timeout = Duration::from_millis(2000);
    let start = Instant::now();
    let sleep_dur = Duration::from_millis(16); // ~60fps poll

    let mut raw_bgra = Vec::new();

    loop {
        match capturer.frame() {
            Ok(buffer) => {
                raw_bgra.extend_from_slice(&buffer);
                break;
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if start.elapsed() > timeout {
                    // Fallback to xcap if DXGI times out entirely (idle screen or isolated)
                    return capture_screen_xcap();
                }
                thread::sleep(sleep_dur);
            }
            Err(_) => {
                // Fallback to xcap silently if DXGI immediately faults (Optimus denied)
                return capture_screen_xcap();
            }
        }
    }

    let stride = raw_bgra.len() / height;
    let mut rgb = Vec::with_capacity(width * height * 3);

    for y in 0..height {
        let row_start = y * stride;
        let row_end = row_start + (width * 4);

        // Safety bounds check for malformed DXGI stride padding
        if row_end > raw_bgra.len() {
            break;
        }

        let row = &raw_bgra[row_start..row_end];

        for pixel in row.chunks_exact(4) {
            // scrap returns BGRA. Push RGB.
            rgb.push(pixel[2]);
            rgb.push(pixel[1]);
            rgb.push(pixel[0]);
        }
    }

    let img =
        image::ImageBuffer::<image::Rgb<u8>, Vec<u8>>::from_raw(width as u32, height as u32, rgb)
            .ok_or("Failed to construct image buffer from DXGI output")?;

    let mut dyn_img = image::DynamicImage::ImageRgb8(img);

    // Scale to 720p
    if dyn_img.height() > 720 {
        let aspect_ratio = dyn_img.width() as f32 / dyn_img.height() as f32;
        let new_width = (720.0 * aspect_ratio) as u32;
        dyn_img = dyn_img.resize_exact(new_width, 720, image::imageops::FilterType::Triangle);
    }

    let mut jpeg = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 50)
        .encode(
            dyn_img.as_bytes(),
            dyn_img.width(),
            dyn_img.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| format!("JPEG encode fail: {:?}", e))?;

    Ok(jpeg)
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
