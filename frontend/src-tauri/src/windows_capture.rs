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

        // 4. Configure BITMAPINFO for CreateDIBSection
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

        // 5. CreateDIBSection (Guarantees linear RAM, no GPU stride padding)
        let mut bits_ptr: *mut core::ffi::c_void = std::ptr::null_mut();
        let bitmap = windows::Win32::Graphics::Gdi::CreateDIBSection(
            screen_dc,
            &bitmap_info as *const _,
            DIB_RGB_COLORS,
            &mut bits_ptr as *mut _,
            windows::Win32::Foundation::HANDLE::default(),
            0,
        );

        if bitmap.is_invalid() || bits_ptr.is_null() {
            DeleteDC(mem_dc);
            DeleteDC(screen_dc);
            return Err("CreateDIBSection failed".to_string());
        }

        // 6. Select Object
        let old_bitmap = SelectObject(mem_dc, bitmap.into());

        // 7. BitBlt (SRCCOPY | CAPTUREBLT to get layered windows)
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

        // 8. Read directly from the linear RAM pointer with correct 4-byte boundary stride alignment
        // CRITICAL: We MUST copy the data to an owned Vec before calling DeleteObject,
        // because DeleteObject will free the memory pointed to by bits_ptr.
        let stride = ((width * 32 + 31) / 32) * 4;
        let src_size = (stride * height) as usize;

        let src_slice = std::slice::from_raw_parts(
            bits_ptr as *const u8,
            src_size,
        );

        let mut bgra_buffer = vec![0u8; (width * height * 4) as usize];

        for y in 0..height as usize {
            let src_offset = y * stride as usize;
            let dst_offset = y * width as usize * 4;

            let src_row = &src_slice[src_offset .. src_offset + width as usize * 4];

            bgra_buffer[dst_offset .. dst_offset + width as usize * 4]
                .copy_from_slice(src_row);
        }

        // Cleanup GDI
        SelectObject(mem_dc, old_bitmap);
        DeleteObject(bitmap.into());
        DeleteDC(mem_dc);
        DeleteDC(screen_dc);

        // CRITICAL DEBUG LOG
        log::info!(
            "[screenshot] GDI Captured (DIBSection): width={}, height={}, buffer.len()={}",
            width,
            height,
            bgra_buffer.len()
        );

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
