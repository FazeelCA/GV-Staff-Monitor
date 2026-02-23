use sha2::{Sha256, Digest};
use hex;
use screenshots::Screen;
use image::DynamicImage;
use std::io::Cursor;
use image::codecs::jpeg::JpegEncoder;

/// Initialize Windows COM library for the current thread.
/// DXGI Desktop Duplication REQUIRES COM to be initialized on the calling thread.
/// Without this, all screen captures silently fail on Windows.
#[cfg(target_os = "windows")]
fn ensure_com_initialized() {
    use std::sync::Once;
    // We use thread_local to ensure COM is initialized per-thread
    thread_local! {
        static COM_INIT: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
    }
    COM_INIT.with(|initialized| {
        if !initialized.get() {
            unsafe {
                // COINIT_MULTITHREADED = 0x0
                // CoInitializeEx(null, COINIT_MULTITHREADED)
                #[link(name = "ole32")]
                extern "system" {
                    fn CoInitializeEx(pvReserved: *mut std::ffi::c_void, dwCoInit: u32) -> i32;
                }
                let hr = CoInitializeEx(std::ptr::null_mut(), 0);
                log::info!("[screenshot] CoInitializeEx result: 0x{:08X}", hr);
            }
            initialized.set(true);
        }
    });
}

#[cfg(not(target_os = "windows"))]
fn ensure_com_initialized() {
    // No-op on macOS / Linux
}

/// Captures the primary screen and returns JPEG bytes + SHA256 Hash.
/// On Windows, explicitly initializes COM for DXGI Desktop Duplication.
pub fn capture_screenshot() -> Result<(Vec<u8>, String), String> {
    // CRITICAL: Must initialize COM before any DXGI call on Windows
    ensure_com_initialized();

    let screens = Screen::all().map_err(|e| format!("Capture init error: {e}"))?;
    
    if screens.is_empty() {
        return Err("No screens found".to_string());
    }

    // Try each screen until one succeeds (handles phantom displays)
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

                let mut hasher = Sha256::new();
                hasher.update(rgb_image.as_raw());
                let hash = hex::encode(hasher.finalize());

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
                    "[screenshot] Captured {}x{} @ {} KB",
                    width, height, bytes.len() / 1024
                );
                return Ok((bytes, hash));
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
