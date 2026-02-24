use sha2::{Digest, Sha256};

// ─────────────────────────────────────────────────────────────────────────────
// Windows: DXGI Desktop Duplication (GPU-aware) → GDI BitBlt fallback
// ─────────────────────────────────────────────────────────────────────────────
#[cfg(target_os = "windows")]
pub fn capture_screen() -> Result<Vec<u8>, String> {
    // Try the modern path first — works on machines with dedicated GPUs.
    match capture_dxgi() {
        Ok(bytes) => {
            log::info!("[screenshot] DXGI capture success: {} KB", bytes.len() / 1024);
            return Ok(bytes);
        }
        Err(e) => {
            log::warn!("[screenshot] DXGI failed ({e}), falling back to GDI BitBlt");
        }
    }

    // Fallback: GDI (works on software-rendered / VPS environments)
    capture_gdi_bitblt()
}

/// DXGI Desktop Duplication — captures the full composited desktop including
/// GPU-accelerated content (browsers, video, DWM).
#[cfg(target_os = "windows")]
fn capture_dxgi() -> Result<Vec<u8>, String> {
    use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_UNKNOWN;
    use windows::Win32::Graphics::Direct3D11::{
        D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
        D3D11_CPU_ACCESS_READ, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
        D3D11_BIND_FLAG, D3D11_RESOURCE_MISC_FLAG,
    };
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory1, IDXGIAdapter1, IDXGIFactory1, IDXGIOutput, IDXGIOutput1,
        IDXGISurface,
        DXGI_OUTPUT_DESC,
    };
    use windows::Win32::Graphics::Dxgi::Common::DXGI_FORMAT_B8G8R8A8_UNORM;
    use windows::core::Interface;
    use image::codecs::jpeg::JpegEncoder;

    unsafe {
        // 1. Create DXGI factory
        let factory: IDXGIFactory1 = CreateDXGIFactory1()
            .map_err(|e| format!("CreateDXGIFactory1: {e}"))?;

        // 2. Get the first adapter
        let adapter: IDXGIAdapter1 = factory
            .EnumAdapters1(0)
            .map_err(|e| format!("EnumAdapters1: {e}"))?;

        // 3. Create D3D11 device on that adapter
        let mut d3d_device: Option<ID3D11Device> = None;
        let mut d3d_context: Option<ID3D11DeviceContext> = None;
        D3D11CreateDevice(
            &adapter,
            D3D_DRIVER_TYPE_UNKNOWN,
            None,
            windows::Win32::Graphics::Direct3D11::D3D11_CREATE_DEVICE_FLAG(0),
            None,
            windows::Win32::Graphics::Direct3D11::D3D11_SDK_VERSION,
            Some(&mut d3d_device),
            None,
            Some(&mut d3d_context),
        )
        .map_err(|e| format!("D3D11CreateDevice: {e}"))?;

        let device = d3d_device.ok_or("D3D device is None")?;

        // 4. Get output (monitor) from adapter
        let output: IDXGIOutput = adapter
            .EnumOutputs(0)
            .map_err(|e| format!("EnumOutputs: {e}"))?;

        let output1: IDXGIOutput1 = output
            .cast::<IDXGIOutput1>()
            .map_err(|e| format!("IDXGIOutput1 cast: {e}"))?;

        // 5. Get desktop dimensions from output desc
        let mut desc = DXGI_OUTPUT_DESC::default();
        output.GetDesc(&mut desc).map_err(|e| format!("GetDesc: {e}"))?;
        let width = (desc.DesktopCoordinates.right - desc.DesktopCoordinates.left) as u32;
        let height = (desc.DesktopCoordinates.bottom - desc.DesktopCoordinates.top) as u32;

        if width == 0 || height == 0 {
            return Err(format!("Invalid output dimensions: {width}x{height}"));
        }

        // 6. Create a staging texture (CPU-readable)
        let staging_desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: windows::Win32::Graphics::Dxgi::Common::DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_STAGING,
            BindFlags: D3D11_BIND_FLAG(0),
            CPUAccessFlags: D3D11_CPU_ACCESS_READ,
            MiscFlags: D3D11_RESOURCE_MISC_FLAG(0),
        };

        let mut staging_texture: Option<ID3D11Texture2D> = None;
        device
            .CreateTexture2D(&staging_desc, None, Some(&mut staging_texture))
            .map_err(|e| format!("CreateTexture2D: {e}"))?;
        let staging = staging_texture.ok_or("staging texture is None")?;

        // 7. Duplicate the output
        let duplication = output1
            .DuplicateOutput(&device)
            .map_err(|e| format!("DuplicateOutput: {e}"))?;

        // 8. Acquire next frame (wait up to 500ms)
        let mut frame_info = windows::Win32::Graphics::Dxgi::DXGI_OUTDUPL_FRAME_INFO::default();
        let mut desktop_resource = None;
        duplication
            .AcquireNextFrame(500, &mut frame_info, &mut desktop_resource)
            .map_err(|e| format!("AcquireNextFrame: {e}"))?;

        let resource = desktop_resource.ok_or("desktop resource is None")?;
        let frame_texture: ID3D11Texture2D = resource
            .cast::<ID3D11Texture2D>()
            .map_err(|e| format!("frame texture cast: {e}"))?;

        // 9. Copy the GPU texture into our CPU-readable staging texture
        let context = d3d_context.ok_or("D3D context is None")?;
        context.CopyResource(&staging, &frame_texture);

        // 10. Release the frame back to the duplicator
        let _ = duplication.ReleaseFrame();

        // 11. Map the staging texture to access pixels on CPU
        let surface: IDXGISurface = staging
            .cast::<IDXGISurface>()
            .map_err(|e| format!("IDXGISurface cast: {e}"))?;

        let mut mapped = windows::Win32::Graphics::Dxgi::DXGI_MAPPED_RECT::default();
        surface
            .Map(&mut mapped, windows::Win32::Graphics::Dxgi::DXGI_MAP_READ)
            .map_err(|e| format!("Map: {e}"))?;

        // 12. Convert BGRA → RGB and encode as JPEG
        let pitch = mapped.Pitch as usize;
        let data_ptr = mapped.pBits;

        let mut rgb_buffer = Vec::with_capacity((width * height * 3) as usize);
        for row in 0..height as usize {
            let row_start = data_ptr.add(row * pitch);
            for col in 0..width as usize {
                let pixel = row_start.add(col * 4);
                let b = *pixel;
                let g = *pixel.add(1);
                let r = *pixel.add(2);
                // alpha (*pixel.add(3)) is discarded
                rgb_buffer.push(r);
                rgb_buffer.push(g);
                rgb_buffer.push(b);
            }
        }

        let _ = surface.Unmap();

        let mut jpeg_data = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_data, 75);
        encoder
            .encode(&rgb_buffer, width, height, image::ColorType::Rgb8.into())
            .map_err(|e| format!("JPEG encode: {e}"))?;

        Ok(jpeg_data)
    }
}

/// Legacy GDI BitBlt path — works on VPS / software-rendered desktops
/// but cannot capture GPU-accelerated (DirectX / DWM-composited) content.
#[cfg(target_os = "windows")]
fn capture_gdi_bitblt() -> Result<Vec<u8>, String> {
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        DIB_RGB_COLORS, RGBQUAD, SRCCOPY, CAPTUREBLT,
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

        let hbitmap = CreateCompatibleBitmap(hdc_screen, width, height);
        if hbitmap.is_invalid() {
            DeleteDC(hdc_mem);
            ReleaseDC(Some(hwnd_desktop), hdc_screen);
            return Err("Failed to create compatible bitmap".to_string());
        }

        let hobj_old = SelectObject(hdc_mem, hbitmap.into());

        // CAPTUREBLT ensures layered windows (tooltips, overlays) are included
        let blt_res = BitBlt(
            hdc_mem, 0, 0, width, height,
            Some(hdc_screen), x, y,
            SRCCOPY | CAPTUREBLT,
        );

        if let Err(e) = blt_res {
            SelectObject(hdc_mem, hobj_old);
            DeleteObject(hbitmap.into());
            DeleteDC(hdc_mem);
            ReleaseDC(Some(hwnd_desktop), hdc_screen);
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
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD { rgbBlue: 0, rgbGreen: 0, rgbRed: 0, rgbReserved: 0 }; 1],
        };

        let mut buffer: Vec<u8> = vec![0; (width * height * 4) as usize];
        let get_di_res = GetDIBits(
            hdc_screen, hbitmap, 0, height as u32,
            Some(buffer.as_mut_ptr() as *mut _),
            &mut bmi, DIB_RGB_COLORS,
        );

        SelectObject(hdc_mem, hobj_old);
        DeleteObject(hbitmap.into());
        DeleteDC(hdc_mem);
        ReleaseDC(Some(hwnd_desktop), hdc_screen);

        if get_di_res == 0 {
            return Err("GetDIBits failed".to_string());
        }

        // Convert BGRA → RGB
        let mut rgb_buffer = Vec::with_capacity((width * height * 3) as usize);
        for chunk in buffer.chunks_exact(4) {
            rgb_buffer.push(chunk[2]); // R
            rgb_buffer.push(chunk[1]); // G
            rgb_buffer.push(chunk[0]); // B
        }

        let mut jpeg_data = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_data, 75);
        encoder
            .encode(&rgb_buffer, width as u32, height as u32, image::ColorType::Rgb8.into())
            .map_err(|e| format!("JPEG encoding failed: {e}"))?;

        log::info!("[screenshot] GDI BitBlt capture success: {} KB", jpeg_data.len() / 1024);
        Ok(jpeg_data)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// macOS / Linux: use `screencapture` CLI (bypasses crate permission issues)
// ─────────────────────────────────────────────────────────────────────────────

/// On macOS we shell out to `screencapture -x -t jpg` which is the same tool
/// the OS itself uses. This reliably honours Screen Recording permission and
/// captures GPU-composited content (unlike the `screenshots` crate).
#[cfg(not(target_os = "windows"))]
pub fn capture_screen() -> Result<Vec<u8>, String> {
    use std::process::Command;
    use std::fs;

    let tmp_path = "/tmp/gv_screenshot_capture.jpg";

    // Remove any stale file from a previous failed attempt
    let _ = fs::remove_file(tmp_path);

    let status = Command::new("screencapture")
        .args([
            "-x",        // no camera shutter sound
            "-t", "jpg", // JPEG output
            "-S",        // capture the full screen (all monitors)
            tmp_path,
        ])
        .status()
        .map_err(|e| format!("screencapture exec failed: {e}"))?;

    if !status.success() {
        return Err(format!(
            "screencapture exited with non-zero status: {:?}. \
             Screen Recording permission may not be granted.",
            status.code()
        ));
    }

    let bytes = fs::read(tmp_path)
        .map_err(|e| format!("Failed to read screenshot file: {e}"))?;

    // Clean up temp file immediately
    let _ = fs::remove_file(tmp_path);

    if bytes.is_empty() {
        return Err(
            "screencapture produced an empty file — Screen Recording permission is likely denied."
                .to_string(),
        );
    }

    log::info!(
        "[screenshot] macOS screencapture success: {} KB",
        bytes.len() / 1024
    );

    Ok(bytes)
}

// ─────────────────────────────────────────────────────────────────────────────
// Common entry point
// ─────────────────────────────────────────────────────────────────────────────

/// Capture the screen and return (JPEG bytes, SHA-256 hex hash).
pub fn capture_screenshot() -> Result<(Vec<u8>, String), String> {
    let jpeg_bytes = capture_screen()?;

    let mut hasher = Sha256::new();
    hasher.update(&jpeg_bytes);
    let hash = hex::encode(hasher.finalize());

    Ok((jpeg_bytes, hash))
}
