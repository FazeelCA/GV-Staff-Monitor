#[cfg(target_os = "windows")]
pub fn capture_desktop_wgc() -> Result<Vec<u8>, String> {
    use image::codecs::jpeg::JpegEncoder;

    use windows::Win32::Foundation::HANDLE;

    use windows::Win32::Graphics::Gdi::{
        BitBlt,
        CreateCompatibleDC,
        CreateDCA,
        CreateDIBSection,
        DeleteDC,
        DeleteObject,
        SelectObject,
        BITMAPINFO,
        BITMAPINFOHEADER,
        BI_RGB,
        CAPTUREBLT,
        DIB_RGB_COLORS,
        SRCCOPY,
    };

    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics,
        SM_XVIRTUALSCREEN,
        SM_YVIRTUALSCREEN,
        SM_CXVIRTUALSCREEN,
        SM_CYVIRTUALSCREEN,
    };

    unsafe {
        let vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let vy = GetSystemMetrics(SM_YVIRTUALSCREEN);

        let width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let height = GetSystemMetrics(SM_CYVIRTUALSCREEN);

        if width <= 0 || height <= 0 {
            return Err("Invalid screen size".into());
        }

        let screen_dc = CreateDCA(windows::core::s!("DISPLAY"), None, None, None);

        if screen_dc.is_invalid() {
            return Err("CreateDCA failed".into());
        }

        let mem_dc = CreateCompatibleDC(Some(screen_dc));

        if mem_dc.is_invalid() {
            DeleteDC(screen_dc);
            return Err("CreateCompatibleDC failed".into());
        }

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
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

        let mut bits_ptr = std::ptr::null_mut();

        let bitmap = CreateDIBSection(
            screen_dc,
            &bmi,
            DIB_RGB_COLORS,
            &mut bits_ptr,
            HANDLE::default(),
            0,
        );

        if bitmap.is_invalid() {
            DeleteDC(mem_dc);
            DeleteDC(screen_dc);
            return Err("CreateDIBSection failed".into());
        }

        let old = SelectObject(mem_dc, bitmap.into());

        BitBlt(
            mem_dc,
            0,
            0,
            width,
            height,
            Some(screen_dc),
            vx,
            vy,
            windows::Win32::Graphics::Gdi::ROP_CODE(
                SRCCOPY.0 | CAPTUREBLT.0
            ),
        ).map_err(|_| "BitBlt failed")?;

        let stride = ((width * 32 + 31) / 32) * 4;
        let src_size = (stride * height) as usize;

        let src = std::slice::from_raw_parts(
            bits_ptr as *const u8,
            src_size,
        );

        let mut bgra = vec![0u8; (width * height * 4) as usize];

        for y in 0..height as usize {
            let src_offset = y * stride as usize;
            let dst_offset = y * width as usize * 4;
            bgra[dst_offset..dst_offset + width as usize * 4]
                .copy_from_slice(
                    &src[src_offset..src_offset + width as usize * 4]
                );
        }

        SelectObject(mem_dc, old);
        DeleteObject(bitmap.into());
        DeleteDC(mem_dc);
        DeleteDC(screen_dc);

        let mut rgb = Vec::with_capacity((width * height * 3) as usize);

        for i in 0..(width * height) as usize {
            rgb.push(bgra[i * 4 + 2]);
            rgb.push(bgra[i * 4 + 1]);
            rgb.push(bgra[i * 4 + 0]);
        }

        let mut jpeg = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut jpeg, 40);

        encoder.encode(
            &rgb,
            width as u32,
            height as u32,
            image::ColorType::Rgb8.into()
        ).map_err(|e| e.to_string())?;

        Ok(jpeg)
    }
}

#[cfg(not(target_os = "windows"))]
pub fn capture_desktop_wgc() -> Result<Vec<u8>, String> {
    Err("Windows only".into())
}
