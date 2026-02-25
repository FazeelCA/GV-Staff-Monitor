#[cfg(target_os = "windows")]
pub fn capture_desktop_wgc() -> Result<Vec<u8>, String> {
    use image::codecs::jpeg::JpegEncoder;
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateDCA, DeleteDC, DeleteObject,
        GetDIBits, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT, DIB_RGB_COLORS,
        SRCCOPY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
        SM_YVIRTUALSCREEN,
    };

    unsafe {
        // 1. Get Virtual Screen Dimensions
        let vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let height = GetSystemMetrics(SM_CYVIRTUALSCREEN);

        if width <= 0 || height <= 0 {
            return Err(format!("Invalid dimensions: {}x{}", width, height));
        }

        // 2 & 3. Create screen DC and compatible memory DC
        let display_name = windows::core::s!("DISPLAY");
        let screen_dc = CreateDCA(display_name, None, None, None);
        if screen_dc.is_invalid() {
            return Err("CreateDCA failed".to_string());
        }

        let mem_dc = CreateCompatibleDC(Some(screen_dc));
        if mem_dc.is_invalid() {
            DeleteDC(screen_dc);
            return Err("CreateCompatibleDC failed".to_string());
        }

        // 4. Create Compatible Bitmap
        let bitmap = CreateCompatibleBitmap(screen_dc, width, height);
        if bitmap.is_invalid() {
            DeleteDC(mem_dc);
            DeleteDC(screen_dc);
            return Err("CreateCompatibleBitmap failed".to_string());
        }

        // 5. Select Object
        let old_bitmap = SelectObject(mem_dc, bitmap.into());

        // 6. BitBlt (SRCCOPY | CAPTUREBLT to get layered windows)
        let ok = BitBlt(
            mem_dc,
            0,
            0,
            width,
            height,
            Some(screen_dc),
            vx,
            vy,
            windows::Win32::Graphics::Gdi::ROP_CODE(SRCCOPY.0 | CAPTUREBLT.0),
        );

        if ok.is_err() {
            SelectObject(mem_dc, old_bitmap);
            DeleteObject(bitmap.into());
            DeleteDC(mem_dc);
            DeleteDC(screen_dc);
            return Err("BitBlt failed".to_string());
        }

        // 7. Configure BITMAPINFO for GetDIBits
        // CRITICAL: biHeight must be negative for top-down DIB
        let mut bitmap_info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // Negative = top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [Default::default()],
        };

        // 8. Allocate exact buffer
        let buffer_size = (width * height * 4) as usize;
        let mut bgra_buffer: Vec<u8> = vec![0; buffer_size];

        // 9. GetDIBits
        let lines = GetDIBits(
            mem_dc,
            bitmap,
            0,
            height as u32,
            Some(bgra_buffer.as_mut_ptr() as *mut _),
            &mut bitmap_info as *mut _,
            DIB_RGB_COLORS,
        );

        // Cleanup GDI
        SelectObject(mem_dc, old_bitmap);
        DeleteObject(bitmap.into());
        DeleteDC(mem_dc);
        DeleteDC(screen_dc);

        if lines == 0 {
            return Err("GetDIBits failed".to_string());
        }

        // CRITICAL DEBUG LOG
        log::info!(
            "[screenshot] GDI Captured: width={}, height={}, buffer.len()={} (expected {})",
            width,
            height,
            bgra_buffer.len(),
            buffer_size
        );

        if bgra_buffer.len() != buffer_size {
            return Err(format!(
                "Buffer size mismatch: got {}, expected {}",
                bgra_buffer.len(),
                buffer_size
            ));
        }

        // 10. Convert BGRA to RGB
        let pixel_count = (width * height) as usize;
        let mut rgb_buffer: Vec<u8> = Vec::with_capacity(pixel_count * 3);
        
        for i in 0..pixel_count {
            let b = bgra_buffer[i * 4];
            let g = bgra_buffer[i * 4 + 1];
            let r = bgra_buffer[i * 4 + 2];
            rgb_buffer.push(r);
            rgb_buffer.push(g);
            rgb_buffer.push(b);
        }

        // 11. Encode to JPEG
        let mut jpeg_data = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_data, 40);
        encoder
            .encode(&rgb_buffer, width as u32, height as u32, image::ColorType::Rgb8.into())
            .map_err(|e| format!("JPEG encoding failed: {e}"))?;

        Ok(jpeg_data)
    }
}

#[cfg(not(target_os = "windows"))]
pub fn capture_desktop_wgc() -> Result<Vec<u8>, String> {
    Err("Screen capture is only supported on Windows".to_string())
}
