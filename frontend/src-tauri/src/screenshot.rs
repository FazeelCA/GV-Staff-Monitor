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
        let factory: IDXGIFactory1 =
            CreateDXGIFactory1().map_err(|e| format!("CreateDXGIFactory1: {e}"))?;

        // Iterate through all GPU adapters
        let mut adapter_idx = 0;
        while let Ok(adapter) = factory.EnumAdapters1(adapter_idx) {
            adapter_idx += 1;

            // Iterate through all outputs (monitors) on this adapter
            let mut output_idx = 0;
            while let Ok(output) = adapter.EnumOutputs(output_idx) {
                output_idx += 1;

                let output1: IDXGIOutput1 = match output.cast::<IDXGIOutput1>() {
                    Ok(o) => o,
                    Err(_) => continue, // Skip if not supported
                };

                let desc = match output1.GetDesc() {
                    Ok(d) => d,
                    Err(_) => continue,
                };

                let width = (desc.DesktopCoordinates.right - desc.DesktopCoordinates.left) as u32;
                let height = (desc.DesktopCoordinates.bottom - desc.DesktopCoordinates.top) as u32;

                if width == 0 || height == 0 {
                    continue;
                }

                // Create D3D11 device
                let mut d3d_device: Option<ID3D11Device> = None;
                let mut d3d_context: Option<ID3D11DeviceContext> = None;
                if D3D11CreateDevice(
                    &adapter,
                    D3D_DRIVER_TYPE_UNKNOWN,
                    HMODULE::default(),
                    D3D11_CREATE_DEVICE_FLAG(0),
                    None,
                    D3D11_SDK_VERSION,
                    Some(&mut d3d_device),
                    None,
                    Some(&mut d3d_context),
                )
                .is_err()
                {
                    continue;
                }

                let device = if let Some(d) = d3d_device { d } else { continue };
                let context = if let Some(c) = d3d_context { c } else { continue };

                let staging_desc = D3D11_TEXTURE2D_DESC {
                    Width: width,
                    Height: height,
                    MipLevels: 1,
                    ArraySize: 1,
                    Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                    SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                    Usage: D3D11_USAGE_STAGING,
                    BindFlags: 0,
                    CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
                    MiscFlags: 0,
                };

                let mut staging_tex: Option<ID3D11Texture2D> = None;
                if device.CreateTexture2D(&staging_desc, None, Some(&mut staging_tex)).is_err() {
                    continue;
                }
                let staging = staging_tex.unwrap();

                let duplication = match output1.DuplicateOutput(&device) {
                    Ok(d) => d,
                    Err(_) => continue,
                };

                // Retry loop for AcquireNextFrame (up to 10 attempts, 200ms each = 2s total block)
                let mut frame_tex_opt: Option<ID3D11Texture2D> = None;
                for _retry in 0..10 {
                    let mut frame_info = DXGI_OUTDUPL_FRAME_INFO::default();
                    let mut desktop_resource = None;

                    match duplication.AcquireNextFrame(200, &mut frame_info, &mut desktop_resource) {
                        Ok(_) => {
                            if let Some(resource) = desktop_resource {
                                if let Ok(tex) = resource.cast::<ID3D11Texture2D>() {
                                    frame_tex_opt = Some(tex);
                                    break;
                                }
                            }
                            let _ = duplication.ReleaseFrame();
                        }
                        Err(e) => {
                            // DXGI_ERROR_WAIT_TIMEOUT == 0x887A0027
                            if e.code().0 == -2005270489 { // WAIT_TIMEOUT
                                continue;
                            }
                            break; // other hardware error
                        }
                    }
                }

                let frame_tex = match frame_tex_opt {
                    Some(tex) => tex,
                    None => continue, // Failed to acquire a frame after retries, try next display
                };

                // Copy GPU frame → CPU-readable staging texture
                context.CopyResource(&staging, &frame_tex);
                let _ = duplication.ReleaseFrame();

                // Map staging surface
                let surface: IDXGISurface = match staging.cast::<IDXGISurface>() {
                    Ok(s) => s,
                    Err(_) => continue,
                };

                let mut mapped = DXGI_MAPPED_RECT::default();
                if surface.Map(&mut mapped, DXGI_MAP_READ).is_err() {
                    continue;
                }

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

                // Encode block
                let mut jpeg_data = Vec::new();
                let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_data, 75);
                if encoder.encode(&rgb_buffer, width, height, image::ColorType::Rgb8.into()).is_ok() {
                    // Success! We return the first valid monitor capture.
                    return Ok(jpeg_data);
                }
            }
        }
        
        Err("No valid outputs captured via DXGI".to_string())
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
