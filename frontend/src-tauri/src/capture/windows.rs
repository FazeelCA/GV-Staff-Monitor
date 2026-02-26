#[cfg(target_os = "windows")]
pub fn capture_desktop() -> Result<Vec<u8>, String> {
    use image::ImageEncoder;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT,
        DIB_RGB_COLORS, SRCCOPY,
    };
    use windows::Win32::UI::HiDpi::{
        SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN,
    };

    unsafe {
        // Enforce DPI awareness so we capture physical pixels, not scaled logic pixels
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

        let width = GetSystemMetrics(SM_CXSCREEN) as usize;
        let height = GetSystemMetrics(SM_CYSCREEN) as usize;

        if width == 0 || height == 0 {
            return Err("Failed to get physical screen dimensions from OS".to_string());
        }

        log::info!(
            "[screenshot] Initiating GDI BitBlt for {}x{}...",
            width,
            height
        );

        let desktop_dc = GetDC(HWND(0));
        if desktop_dc.is_invalid() {
            return Err("Failed to get desktop graphics context".to_string());
        }

        let memory_dc = CreateCompatibleDC(desktop_dc);
        if memory_dc.is_invalid() {
            ReleaseDC(HWND(0), desktop_dc);
            return Err("Failed to create memory context".to_string());
        }

        let h_bitmap = CreateCompatibleBitmap(desktop_dc, width as i32, height as i32);
        if h_bitmap.is_invalid() {
            DeleteDC(memory_dc);
            ReleaseDC(HWND(0), desktop_dc);
            return Err("Failed to create compatible memory bitmap".to_string());
        }

        let old_bitmap = SelectObject(memory_dc, h_bitmap);

        // Perform the GDI screen capture into system RAM (bypasses ALL GPU format bugs)
        let blit_success = BitBlt(
            memory_dc,
            0,
            0,
            width as i32,
            height as i32,
            desktop_dc,
            0,
            0,
            SRCCOPY | CAPTUREBLT,
        );

        if blit_success.is_err() {
            SelectObject(memory_dc, old_bitmap);
            DeleteObject(h_bitmap);
            DeleteDC(memory_dc);
            ReleaseDC(HWND(0), desktop_dc);
            return Err("BitBlt screen copy failed".to_string());
        }

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32), // negative for top-down DIB memory format
                biPlanes: 1,
                biBitCount: 32, // BGRA is standard Windows DIB 32-bit format (perfect 4-byte alignment)
                biCompression: BI_RGB.0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [windows::Win32::Graphics::Gdi::RGBQUAD {
                rgbBlue: 0,
                rgbGreen: 0,
                rgbRed: 0,
                rgbReserved: 0,
            }],
        };

        let mut raw_pixels = vec![0u8; width * height * 4];

        // Format and copy the bitmap bytes from the memory DC back to Rust
        let scanlines = GetDIBits(
            memory_dc,
            h_bitmap,
            0,
            height as u32,
            Some(raw_pixels.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        // Clean up unmanaged pointers
        SelectObject(memory_dc, old_bitmap);
        DeleteObject(h_bitmap);
        DeleteDC(memory_dc);
        ReleaseDC(HWND(0), desktop_dc);

        if scanlines == 0 {
            return Err("GetDIBits failed to extract image bytes".to_string());
        }

        // Convert strict BGRA → RGB for JPEG
        let mut rgb = Vec::with_capacity(width * height * 3);
        for pixel in raw_pixels.chunks_exact(4) {
            rgb.push(pixel[2]); // R
            rgb.push(pixel[1]); // G
            rgb.push(pixel[0]); // B
                                // Drop alpha
        }

        let mut jpeg = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 40)
            .write_image(
                &rgb,
                width as u32,
                height as u32,
                image::ColorType::Rgb8.into(),
            )
            .map_err(|e| format!("JPEG encode failed: {e}"))?;

        log::info!(
            "[screenshot] GDI capture success: {}x{} → {} KB",
            width,
            height,
            jpeg.len() / 1024
        );

        Ok(jpeg)
    }
}
