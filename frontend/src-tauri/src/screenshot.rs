use sha2::{Digest, Sha256};

// ─────────────────────────────────────────────────────────────────────────────
// Windows: DXGI Desktop Duplication (GPU-aware) → GDI BitBlt fallback
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
pub fn capture_screen() -> Result<Vec<u8>, String> {
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CAPTUREBLT, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject,
        GetDC, GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        DIB_RGB_COLORS, RGBQUAD, SRCCOPY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetDesktopWindow, GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
        SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
    };
    use image::codecs::jpeg::JpegEncoder;

    unsafe {
        let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let height = GetSystemMetrics(SM_CYVIRTUALSCREEN);

        if width == 0 || height == 0 {
            return Err("Invalid virtual screen dimensions".to_string());
        }

        let hwnd = GetDesktopWindow();
        let hdc_screen = GetDC(Some(hwnd));
        if hdc_screen.is_invalid() {
            return Err("Failed to get desktop DC".to_string());
        }

        let hdc_mem = CreateCompatibleDC(Some(hdc_screen));
        if hdc_mem.is_invalid() {
            ReleaseDC(Some(hwnd), hdc_screen);
            return Err("Failed to create compatible DC".to_string());
        }

        let hbitmap = CreateCompatibleBitmap(hdc_screen, width, height);
        if hbitmap.is_invalid() {
            DeleteDC(hdc_mem);
            ReleaseDC(Some(hwnd), hdc_screen);
            return Err("Failed to create compatible bitmap".to_string());
        }

        let old = SelectObject(hdc_mem, hbitmap.into());

        // CAPTUREBLT captures layered/overlay windows too, which might fix HW-accelerated windows on some GPUs
        let blt_res = BitBlt(hdc_mem, 0, 0, width, height, Some(hdc_screen), x, y, SRCCOPY | CAPTUREBLT);
        if let Err(e) = blt_res {
            SelectObject(hdc_mem, old);
            DeleteObject(hbitmap.into());
            DeleteDC(hdc_mem);
            ReleaseDC(Some(hwnd), hdc_screen);
            return Err(format!("BitBlt failed: {e}"));
        }

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            bmiColors: [RGBQUAD::default(); 1],
        };

        let mut buf: Vec<u8> = vec![0; (width * height * 4) as usize];
        let res = GetDIBits(
            hdc_screen, hbitmap, 0, height as u32,
            Some(buf.as_mut_ptr() as *mut _),
            &mut bmi, DIB_RGB_COLORS,
        );

        SelectObject(hdc_mem, old);
        DeleteObject(hbitmap.into());
        DeleteDC(hdc_mem);
        ReleaseDC(Some(hwnd), hdc_screen);

        if res == 0 {
            return Err("GetDIBits failed".to_string());
        }

        // BGRA → RGB
        let mut rgb_buffer = Vec::with_capacity((width * height * 3) as usize);
        for chunk in buf.chunks_exact(4) {
            rgb_buffer.push(chunk[2]); // R
            rgb_buffer.push(chunk[1]); // G
            rgb_buffer.push(chunk[0]); // B
        }

        let mut is_blank = true;
        let first_r = rgb_buffer[0];
        let first_g = rgb_buffer[1];
        let first_b = rgb_buffer[2];
        for i in (0..rgb_buffer.len()).step_by(3) {
            if rgb_buffer[i] != first_r || rgb_buffer[i+1] != first_g || rgb_buffer[i+2] != first_b {
                is_blank = false;
                break;
            }
        }
        if is_blank {
            return Err("GDI BitBlt captured a completely blank/solid frame".to_string());
        }

        let mut jpeg_data = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_data, 75);
        encoder
            .encode(&rgb_buffer, width as u32, height as u32, image::ColorType::Rgb8.into())
            .map_err(|e| format!("JPEG encoding failed: {e}"))?;

        log::info!("[screenshot] GDI BitBlt capture: {} KB", jpeg_data.len() / 1024);
        Ok(jpeg_data)
    }
}
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CAPTUREBLT, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject,
        GetDC, GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        DIB_RGB_COLORS, RGBQUAD, SRCCOPY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetDesktopWindow, GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
        SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
    };
    use image::codecs::jpeg::JpegEncoder;

    unsafe {
        let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let height = GetSystemMetrics(SM_CYVIRTUALSCREEN);

        if width == 0 || height == 0 {
            return Err("Invalid virtual screen dimensions".to_string());
        }

        let hwnd = GetDesktopWindow();
        let hdc_screen = GetDC(Some(hwnd));
        if hdc_screen.is_invalid() {
            return Err("Failed to get desktop DC".to_string());
        }

        let hdc_mem = CreateCompatibleDC(Some(hdc_screen));
        if hdc_mem.is_invalid() {
            ReleaseDC(Some(hwnd), hdc_screen);
            return Err("Failed to create compatible DC".to_string());
        }

        let hbitmap = CreateCompatibleBitmap(hdc_screen, width, height);
        if hbitmap.is_invalid() {
            DeleteDC(hdc_mem);
            ReleaseDC(Some(hwnd), hdc_screen);
            return Err("Failed to create compatible bitmap".to_string());
        }

        let old = SelectObject(hdc_mem, hbitmap.into());

        // CAPTUREBLT captures layered/overlay windows too
        let blt_res = BitBlt(hdc_mem, 0, 0, width, height, Some(hdc_screen), x, y, SRCCOPY | CAPTUREBLT);
        if let Err(e) = blt_res {
            SelectObject(hdc_mem, old);
            DeleteObject(hbitmap.into());
            DeleteDC(hdc_mem);
            ReleaseDC(Some(hwnd), hdc_screen);
            return Err(format!("BitBlt failed: {e}"));
        }

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            bmiColors: [RGBQUAD::default(); 1],
        };

        let mut buf: Vec<u8> = vec![0; (width * height * 4) as usize];
        let res = GetDIBits(
            hdc_screen, hbitmap, 0, height as u32,
            Some(buf.as_mut_ptr() as *mut _),
            &mut bmi, DIB_RGB_COLORS,
        );

        SelectObject(hdc_mem, old);
        DeleteObject(hbitmap.into());
        DeleteDC(hdc_mem);
        ReleaseDC(Some(hwnd), hdc_screen);

        if res == 0 {
            return Err("GetDIBits failed".to_string());
        }

        // BGRA → RGB
        let mut rgb_buffer = Vec::with_capacity((width * height * 3) as usize);
        for chunk in buf.chunks_exact(4) {
            rgb_buffer.push(chunk[2]); // R
            rgb_buffer.push(chunk[1]); // G
            rgb_buffer.push(chunk[0]); // B
        }

        let mut is_blank = true;
        let first_r = rgb_buffer[0];
        let first_g = rgb_buffer[1];
        let first_b = rgb_buffer[2];
        for i in (0..rgb_buffer.len()).step_by(3) {
            if rgb_buffer[i] != first_r || rgb_buffer[i+1] != first_g || rgb_buffer[i+2] != first_b {
                is_blank = false;
                break;
            }
        }
        if is_blank {
            return Err("GDI BitBlt captured a completely blank/solid frame".to_string());
        }

        let mut jpeg_data = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_data, 75);
        encoder
            .encode(&rgb_buffer, width as u32, height as u32, image::ColorType::Rgb8.into())
            .map_err(|e| format!("JPEG encoding failed: {e}"))?;

        log::info!("[screenshot] GDI BitBlt capture: {} KB", jpeg_data.len() / 1024);
        Ok(jpeg_data)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// macOS: native `screencapture` CLI (reliable permission handling)
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(not(target_os = "windows"))]
pub fn capture_screen() -> Result<Vec<u8>, String> {
    use std::process::Command;
    use std::fs;

    let tmp_path = "/tmp/gv_screenshot_capture.jpg";
    let _ = fs::remove_file(tmp_path); // clean up any stale file

    let status = Command::new("screencapture")
        .args([
            "-x",        // silent (no shutter sound)
            "-t", "jpg", // JPEG output
            tmp_path,
        ])
        .status()
        .map_err(|e| format!("screencapture exec failed: {e}"))?;

    if !status.success() {
        return Err(format!(
            "screencapture exited {:?} — Screen Recording permission may be denied.",
            status.code()
        ));
    }

    let bytes = fs::read(tmp_path)
        .map_err(|e| format!("Failed to read screenshot file: {e}"))?;
    let _ = fs::remove_file(tmp_path);

    if bytes.is_empty() {
        return Err(
            "screencapture produced an empty file — Screen Recording permission likely denied."
                .to_string(),
        );
    }

    log::info!("[screenshot] macOS screencapture: {} KB", bytes.len() / 1024);
    Ok(bytes)
}

// ─────────────────────────────────────────────────────────────────────────────
// Common entry point
// ─────────────────────────────────────────────────────────────────────────────

pub fn capture_screenshot() -> Result<(Vec<u8>, String), String> {
    let jpeg_bytes = capture_screen()?;
    let mut hasher = Sha256::new();
    hasher.update(&jpeg_bytes);
    let hash = hex::encode(hasher.finalize());
    Ok((jpeg_bytes, hash))
}
