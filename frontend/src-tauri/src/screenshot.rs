use sha2::{Digest, Sha256};

// ─────────────────────────────────────────────────────────────────────────────
// Windows: DXGI Desktop Duplication (GPU-aware) → GDI BitBlt fallback
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
pub fn capture_screen() -> Result<Vec<u8>, String> {
    match capture_dxgi() {
        Ok(bytes) => {
            log::info!("[screenshot] DXGI capture success: {} KB", bytes.len() / 1024);
            return Ok(bytes);
        }
        Err(e) => {
            log::warn!("[screenshot] DXGI failed ({e}), falling back to GDI BitBlt");
        }
    }
    capture_gdi_bitblt()
}

/// DXGI Desktop Duplication — captures the full GPU-composited desktop including
/// browser windows, video, and all DirectX/DWM-rendered content.
#[cfg(target_os = "windows")]
fn capture_dxgi() -> Result<Vec<u8>, String> {
    use windows::Win32::Foundation::HMODULE;
    use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_UNKNOWN;
    use windows::Win32::Graphics::Direct3D11::{
        D3D11CreateDevice, D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_FLAG,
        D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
        ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
    };
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory1, IDXGIAdapter1, IDXGIFactory1, IDXGIOutput1,
        IDXGISurface, DXGI_MAP_READ, DXGI_MAPPED_RECT, DXGI_OUTDUPL_FRAME_INFO,
    };
    use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};
    use windows::core::Interface;
    use image::codecs::jpeg::JpegEncoder;

    unsafe {
        // 1. DXGI factory → first adapter
        let factory: IDXGIFactory1 =
            CreateDXGIFactory1().map_err(|e| format!("CreateDXGIFactory1: {e}"))?;
        let adapter: IDXGIAdapter1 =
            factory.EnumAdapters1(0).map_err(|e| format!("EnumAdapters1: {e}"))?;

        // 2. Create D3D11 device on that adapter
        let mut d3d_device: Option<ID3D11Device> = None;
        let mut d3d_context: Option<ID3D11DeviceContext> = None;
        D3D11CreateDevice(
            &adapter,
            D3D_DRIVER_TYPE_UNKNOWN,
            HMODULE::default(), // no external software rasterizer module
            D3D11_CREATE_DEVICE_FLAG(0),
            None,               // use default feature levels
            D3D11_SDK_VERSION,
            Some(&mut d3d_device),
            None,
            Some(&mut d3d_context),
        )
        .map_err(|e| format!("D3D11CreateDevice: {e}"))?;

        let device = d3d_device.ok_or("D3D device is None")?;
        let context = d3d_context.ok_or("D3D context is None")?;

        // 3. Get first monitor as IDXGIOutput1
        let output1: IDXGIOutput1 = adapter
            .EnumOutputs(0)
            .map_err(|e| format!("EnumOutputs: {e}"))?
            .cast::<IDXGIOutput1>()
            .map_err(|e| format!("IDXGIOutput1 cast: {e}"))?;

        // In windows-rs 0.61 GetDesc() takes no args and returns Result<DXGI_OUTPUT_DESC>
        let desc = output1.GetDesc().map_err(|e| format!("GetDesc: {e}"))?;
        let width = (desc.DesktopCoordinates.right - desc.DesktopCoordinates.left) as u32;
        let height = (desc.DesktopCoordinates.bottom - desc.DesktopCoordinates.top) as u32;

        if width == 0 || height == 0 {
            return Err(format!("Invalid output dimensions: {width}x{height}"));
        }

        // 4. Create a CPU-readable staging texture
        // Note: BindFlags / CPUAccessFlags / MiscFlags are plain u32 in windows-rs 0.61
        let staging_desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
            Usage: D3D11_USAGE_STAGING,
            BindFlags: 0,                    // u32 — no bind flags for staging
            CPUAccessFlags: D3D11_CPU_ACCESS_READ.0, // extract u32 from flag wrapper
            MiscFlags: 0,                    // u32
        };

        let mut staging_tex: Option<ID3D11Texture2D> = None;
        device
            .CreateTexture2D(&staging_desc, None, Some(&mut staging_tex))
            .map_err(|e| format!("CreateTexture2D: {e}"))?;
        let staging = staging_tex.ok_or("staging texture is None")?;

        // 5. Duplicate the output and acquire one frame (wait up to 500 ms)
        let duplication = output1
            .DuplicateOutput(&device)
            .map_err(|e| format!("DuplicateOutput: {e}"))?;

        let mut frame_info = DXGI_OUTDUPL_FRAME_INFO::default();
        let mut desktop_resource = None;
        duplication
            .AcquireNextFrame(500, &mut frame_info, &mut desktop_resource)
            .map_err(|e| format!("AcquireNextFrame: {e}"))?;

        let resource = desktop_resource.ok_or("desktop resource is None")?;
        let frame_tex: ID3D11Texture2D = resource
            .cast::<ID3D11Texture2D>()
            .map_err(|e| format!("frame texture cast: {e}"))?;

        // 6. Copy GPU frame → CPU-readable staging texture
        context.CopyResource(&staging, &frame_tex);
        let _ = duplication.ReleaseFrame();

        // 7. Map staging surface to read raw pixel bytes
        let surface: IDXGISurface = staging
            .cast::<IDXGISurface>()
            .map_err(|e| format!("IDXGISurface cast: {e}"))?;

        let mut mapped = DXGI_MAPPED_RECT::default();
        surface
            .Map(&mut mapped, DXGI_MAP_READ)
            .map_err(|e| format!("Map: {e}"))?;

        // 8. Convert BGRA → RGB (strip alpha for JPEG)
        let pitch = mapped.Pitch as usize;
        let data_ptr = mapped.pBits;
        let mut rgb_buffer = Vec::with_capacity((width * height * 3) as usize);
        for row in 0..height as usize {
            let row_start = data_ptr.add(row * pitch);
            for col in 0..width as usize {
                let px = row_start.add(col * 4);
                let b = *px;
                let g = *px.add(1);
                let r = *px.add(2);
                rgb_buffer.push(r);
                rgb_buffer.push(g);
                rgb_buffer.push(b);
            }
        }
        let _ = surface.Unmap();

        // 9. Encode as JPEG
        let mut jpeg_data = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_data, 75);
        encoder
            .encode(&rgb_buffer, width, height, image::ColorType::Rgb8.into())
            .map_err(|e| format!("JPEG encode: {e}"))?;

        Ok(jpeg_data)
    }
}

/// GDI BitBlt fallback — works on VPS/software-rendered desktops.
/// Cannot capture GPU DirectX/DWM-composited content on machines with dedicated GPUs.
#[cfg(target_os = "windows")]
fn capture_gdi_bitblt() -> Result<Vec<u8>, String> {
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
