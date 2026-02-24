use sha2::{Digest, Sha256};
#[cfg(not(target_os = "windows"))]
use std::io::Cursor;
use image::codecs::jpeg::JpegEncoder;

/// Primary capture path for Windows: Uses native Win32 GDI via `windows-rs`.
/// This operates entirely in-memory within the Tauri process, avoiding all 
/// flashing console windows, DXGI failures, and external executables.
#[cfg(target_os = "windows")]
pub fn capture_screen() -> Result<Vec<u8>, String> {
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
        ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, RGBQUAD, SRCCOPY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetDesktopWindow, GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
        SM_YVIRTUALSCREEN,
    };

    unsafe {
        // 1. Get dimensions of the virtual screen (all monitors combined)
        let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let height = GetSystemMetrics(SM_CYVIRTUALSCREEN);

        if width == 0 || height == 0 {
            return Err("Invalid virtual screen dimensions".to_string());
        }

        // 2. Get Device Contexts (DC)
        // GetDesktopWindow() returns HWND. GetDC takes Option<HWND>.
        let hwnd_desktop = GetDesktopWindow();
        let hdc_screen = GetDC(Some(hwnd_desktop));
        if hdc_screen.is_invalid() {
            return Err("Failed to get desktop DC".to_string());
        }

        let hdc_mem = CreateCompatibleDC(Some(hdc_screen));
        if hdc_mem.is_invalid() {
            ReleaseDC(Some(hwnd_desktop), hdc_screen);
            return Err("Failed to create compatible DC".to_string());
        }

        // 3. Create a bitmap to hold the captured pixels
        let hbitmap = CreateCompatibleBitmap(hdc_screen, width, height);
        if hbitmap.is_invalid() {
            DeleteDC(hdc_mem);
            ReleaseDC(Some(hwnd_desktop), hdc_screen);
            return Err("Failed to create compatible bitmap".to_string());
        }

        // 4. Select the bitmap into our memory DC
        let hobj_old = SelectObject(hdc_mem, hbitmap.into());

        // 5. Perform the fast BitBlt capture natively
        let blt_res = BitBlt(
            hdc_mem,
            0,
            0,
            width,
            height,
            Some(hdc_screen),
            x,
            y,
            SRCCOPY,
        );

        if let Err(e) = blt_res {
            SelectObject(hdc_mem, hobj_old);
            DeleteObject(hbitmap.into());
            DeleteDC(hdc_mem);
            ReleaseDC(Some(hwnd_desktop), hdc_screen);
            return Err(format!("BitBlt failed: {e}"));
        }

        // 6. Setup the DIB info to extract the raw BGRA bytes
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // negative means top-down
                biPlanes: 1,
                biBitCount: 32, // BGRA
                biCompression: BI_RGB.0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD { rgbBlue: 0, rgbGreen: 0, rgbRed: 0, rgbReserved: 0 }; 1],
        };

        // Allocate buffer for 32-bit (4 bytes) per pixel
        let mut buffer: Vec<u8> = vec![0; (width * height * 4) as usize];

        // 7. Extract the pixels into our buffer
        let get_di_res = GetDIBits(
            hdc_screen,
            hbitmap,
            0,
            height as u32,
            Some(buffer.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        // 8. CRITICAL: Clean up GDI handles memory leaks!
        SelectObject(hdc_mem, hobj_old);
        DeleteObject(hbitmap.into());
        DeleteDC(hdc_mem);
        ReleaseDC(Some(hwnd_desktop), hdc_screen);

        if get_di_res == 0 {
            return Err("GetDIBits failed".to_string());
        }

        // 9. Convert BGRA to RGB (3-bytes per pixel) for the JPEG encoder
        // JPEG encoder DOES NOT support Alpha channels (RGBA), so we must strip the 4th byte.
        let mut rgb_buffer = Vec::with_capacity((width * height * 3) as usize);
        for chunk in buffer.chunks_exact(4) {
            let b = chunk[0];
            let g = chunk[1];
            let r = chunk[2];
            rgb_buffer.push(r);
            rgb_buffer.push(g);
            rgb_buffer.push(b);
        }

        // 10. Encode as JPEG directly to memory
        let mut jpeg_data = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_data, 75);
        encoder
            .encode(
                &rgb_buffer,
                width as u32,
                height as u32,
                image::ColorType::Rgb8.into(),
            )
            .map_err(|e| format!("JPEG encoding failed: {e}"))?;

        log::info!("[screenshot] Windows GDI native capture success: {} KB", jpeg_data.len() / 1024);
        Ok(jpeg_data)
    }
}

/// Fallback for macOS / Linux. Keeps `screenshots` crate only for non-Windows platforms.
#[cfg(not(target_os = "windows"))]
pub fn capture_screen() -> Result<Vec<u8>, String> {
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
                    "[screenshot] macOS/Linux capture: {}x{} @ {} KB",
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

/// Main entry point: delegates to native GDI on Windows, or crate on Mac/Linux.
/// Returns JPEG bytes + SHA256 hash.
pub fn capture_screenshot() -> Result<(Vec<u8>, String), String> {
    let jpeg_bytes = capture_screen()?;

    // Hash the JPEG bytes
    let mut hasher = Sha256::new();
    hasher.update(&jpeg_bytes);
    let hash = hex::encode(hasher.finalize());

    Ok((jpeg_bytes, hash))
}
