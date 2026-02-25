#[cfg(target_os = "windows")]
pub fn capture_desktop_wgc() -> Result<Vec<u8>, String> {
    // GDI BitBlt Capture - v0.1.45
    // Replaces the WGC approach which had persistent stride/dimension mismatches.
    // GDI BitBlt gives us complete control over the buffer: no GPU texture padding,
    // no logical vs physical pixel confusion — zero stride ambiguity.
    use image::codecs::jpeg::JpegEncoder;
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateDCA, DeleteDC, DeleteObject,
        GetDIBits, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, SRCCOPY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
        SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
    };

    unsafe {
        // 1. Get the virtual screen dimensions (covers all monitors)
        let vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let vw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);

        if vw <= 0 || vh <= 0 {
            return Err(format!("Invalid virtual screen dimensions: {}x{}", vw, vh));
        }

        let width = vw as u32;
        let height = vh as u32;

        log::info!("[screenshot] GDI capture: {}x{} at ({},{})", width, height, vx, vy);

        // 2. Create a screen DC and a compatible memory DC
        let display_name = windows::core::s!("DISPLAY");
        let screen_dc = CreateDCA(display_name, None, None, None);
        if screen_dc.is_invalid() {
            return Err("CreateDCA(DISPLAY) failed".to_string());
        }

        let mem_dc = CreateCompatibleDC(Some(screen_dc));
        if mem_dc.is_invalid() {
            DeleteDC(screen_dc);
            return Err("CreateCompatibleDC failed".to_string());
        }

        // 3. Create a compatible bitmap sized exactly to the virtual screen
        let bitmap = CreateCompatibleBitmap(screen_dc, vw, vh);
        if bitmap.is_invalid() {
            DeleteDC(mem_dc);
            DeleteDC(screen_dc);
            return Err("CreateCompatibleBitmap failed".to_string());
        }

        let old_bitmap = SelectObject(mem_dc, bitmap.into());

        // 4. BitBlt the entire virtual screen into our bitmap
        let ok = BitBlt(mem_dc, 0, 0, vw, vh, Some(screen_dc), vx, vy, SRCCOPY);
        if ok.is_err() {
            SelectObject(mem_dc, old_bitmap);
            DeleteObject(bitmap.into());
            DeleteDC(mem_dc);
            DeleteDC(screen_dc);
            return Err("BitBlt failed".to_string());
        }

        // 5. Extract raw pixel data using GetDIBits
        // We request 32-bit BGRA (BITMAPINFOHEADER with BI_RGB and biBitCount=32)
        // biHeight is NEGATIVE → top-down scan order → no row-reversal needed
        let bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: vw,
                biHeight: -(vh), // Negative = top-down (no row reversal needed)
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

        let pixel_count = (width * height) as usize;
        let mut bgra: Vec<u8> = vec![0u8; pixel_count * 4];

        let lines_copied = GetDIBits(
            mem_dc,
            bitmap,
            0,
            height,
            Some(bgra.as_mut_ptr() as *mut _),
            &bmi as *const _ as *mut _,
            DIB_RGB_COLORS,
        );

        // Clean up GDI resources
        SelectObject(mem_dc, old_bitmap);
        DeleteObject(bitmap.into());
        DeleteDC(mem_dc);
        DeleteDC(screen_dc);

        if lines_copied == 0 {
            return Err("GetDIBits returned 0 lines".to_string());
        }

        // 6. Convert BGRA → RGB (exactly width*height*3 bytes, no stride padding)
        let mut rgb: Vec<u8> = Vec::with_capacity(pixel_count * 3);
        for i in 0..pixel_count {
            let b = bgra[i * 4];
            let g = bgra[i * 4 + 1];
            let r = bgra[i * 4 + 2];
            rgb.push(r);
            rgb.push(g);
            rgb.push(b);
        }

        // 7. Sanity check: reject completely blank frames
        let first_r = rgb[0];
        let first_g = rgb[1];
        let first_b = rgb[2];
        let mut is_blank = true;
        for i in (0..rgb.len()).step_by(3) {
            if rgb[i] != first_r || rgb[i + 1] != first_g || rgb[i + 2] != first_b {
                is_blank = false;
                break;
            }
        }
        if is_blank {
            return Err("Captured blank/solid frame (DRM or display off)".to_string());
        }

        // 8. Encode to JPEG
        let mut jpeg_data = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_data, 40);
        encoder
            .encode(&rgb, width, height, image::ColorType::Rgb8.into())
            .map_err(|e| format!("JPEG encoding failed: {e}"))?;

        log::info!(
            "[screenshot] GDI capture complete: {}x{} = {} KB",
            width, height, jpeg_data.len() / 1024
        );

        Ok(jpeg_data)
    }
}

#[cfg(not(target_os = "windows"))]
pub fn capture_desktop_wgc() -> Result<Vec<u8>, String> {
    Err("Screen capture is only supported on Windows".to_string())
}
