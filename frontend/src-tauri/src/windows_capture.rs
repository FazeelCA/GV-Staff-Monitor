#[cfg(target_os = "windows")]
pub fn capture_desktop_wgc() -> Result<Vec<u8>, String> {
    use std::sync::mpsc;
    use std::time::Duration;

    use image::codecs::jpeg::JpegEncoder;
    use windows::core::{IInspectable, Interface, BOOL};
    use windows::Graphics::Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem};
    use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
    use windows::Graphics::DirectX::DirectXPixelFormat;
    use windows::Win32::Foundation::{HMODULE, LPARAM, RECT};
    use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP};
    use windows::Win32::Graphics::Direct3D11::{
        D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
        D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE,
        D3D11_MAP_READ, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
    };
    use windows::Win32::Graphics::Dxgi::IDXGIDevice;
    use windows::Win32::Graphics::Gdi::{
        EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW,
    };
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
    use windows::Win32::System::WinRT::Direct3D11::CreateDirect3D11DeviceFromDXGIDevice;
    use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
    use windows::Win32::System::WinRT::{
        CreateDispatcherQueueController, DispatcherQueueOptions, DQTAT_COM_NONE,
        DQTYPE_THREAD_CURRENT,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
    };

    unsafe {
        // Init COM
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        // Initialize DispatcherQueue for the current thread
        // WinRT async events (like FrameArrived) require this on non-UI threads
        let dq_options = DispatcherQueueOptions {
            dwSize: std::mem::size_of::<DispatcherQueueOptions>() as u32,
            threadType: DQTYPE_THREAD_CURRENT,
            apartmentType: DQTAT_COM_NONE,
        };
        let _dq_controller = CreateDispatcherQueueController(dq_options).ok();

        // Initial pass: Gather monitors and their physical sizes to calculate a global physical canvas

        struct MonitorCaptureInfo {
            hmonitor: HMONITOR,
            item: GraphicsCaptureItem,
            logical_x: i32,
            logical_y: i32,
            logical_width: u32,
            logical_height: u32,
            physical_width: u32,
            physical_height: u32,
        }

        let mut capture_infos: Vec<MonitorCaptureInfo> = Vec::new();
        let interop: IGraphicsCaptureItemInterop =
            windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()
                .map_err(|e| format!("Failed to get IGraphicsCaptureItemInterop: {e}"))?;

        // 1. Enumerate Monitors
        let mut monitors: Vec<HMONITOR> = Vec::new();
        unsafe extern "system" fn monitor_enum_proc(
            hmonitor: HMONITOR,
            _hdc: HDC,
            _rect: *mut RECT,
            lparam: LPARAM,
        ) -> BOOL {
            let monitors = &mut *(lparam.0 as *mut Vec<HMONITOR>);
            monitors.push(hmonitor);
            BOOL::from(true)
        }

        EnumDisplayMonitors(
            None,
            None,
            Some(monitor_enum_proc),
            LPARAM(&mut monitors as *mut _ as isize),
        );

        if monitors.is_empty() {
            return Err("No monitors found".to_string());
        }

        // 2. Determine Logial Origin (vx, vy) directly from monitors to avoid system metric mismatches
        let mut min_lx = i32::MAX;
        let mut min_ly = i32::MAX;
        for &hmonitor in &monitors {
            let mut mi = MONITORINFOEXW::default();
            mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
            if GetMonitorInfoW(hmonitor, &mut mi as *mut _ as *mut MONITORINFO).as_bool() {
                min_lx = min_lx.min(mi.monitorInfo.rcMonitor.left);
                min_ly = min_ly.min(mi.monitorInfo.rcMonitor.top);
            }
        }
        let vx = if min_lx == i32::MAX { 0 } else { min_lx };
        let vy = if min_ly == i32::MAX { 0 } else { min_ly };

        // 3. Pre-pass: Calculate global physical bounding box
        let mut min_px = 0i32;
        let mut min_py = 0i32;
        let mut max_px = 0i32;
        let mut max_py = 0i32;

        for &hmonitor in &monitors {
            let mut mi = MONITORINFOEXW::default();
            mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
            if !GetMonitorInfoW(hmonitor, &mut mi as *mut _ as *mut MONITORINFO).as_bool() {
                continue;
            }

            let item_res = interop.CreateForMonitor::<GraphicsCaptureItem>(hmonitor);
            if let Ok(item) = item_res {
                if let Ok(item_size) = item.Size() {
                    let pw = item_size.Width as u32;
                    let ph = item_size.Height as u32;
                    let lw = (mi.monitorInfo.rcMonitor.right - mi.monitorInfo.rcMonitor.left).abs()
                        as u32;
                    let lh = (mi.monitorInfo.rcMonitor.bottom - mi.monitorInfo.rcMonitor.top).abs()
                        as u32;

                    let sx = if lw > 0 { pw as f64 / lw as f64 } else { 1.0 };
                    let sy = if lh > 0 { ph as f64 / lh as f64 } else { 1.0 };

                    // Use round() for more stable coordinate mapping
                    let physical_left =
                        ((mi.monitorInfo.rcMonitor.left - vx) as f64 * sx).round() as i32;
                    let physical_top =
                        ((mi.monitorInfo.rcMonitor.top - vy) as f64 * sy).round() as i32;

                    // Single monitor fast-path: Force 0,0 origin to prevent any 1-pixel rounding drift
                    let (p_left, p_top) = if monitors.len() == 1 {
                        (0, 0)
                    } else {
                        (physical_left, physical_top)
                    };

                    let physical_right = p_left + pw as i32;
                    let physical_bottom = p_top + ph as i32;

                    if capture_infos.is_empty() {
                        min_px = p_left;
                        min_py = p_top;
                        max_px = physical_right;
                        max_py = physical_bottom;
                    } else {
                        min_px = min_px.min(p_left);
                        min_py = min_py.min(p_top);
                        max_px = max_px.max(physical_right);
                        max_py = max_py.max(physical_bottom);
                    }

                    capture_infos.push(MonitorCaptureInfo {
                        hmonitor,
                        item,
                        logical_x: mi.monitorInfo.rcMonitor.left,
                        logical_y: mi.monitorInfo.rcMonitor.top,
                        logical_width: lw,
                        logical_height: lh,
                        physical_width: pw,
                        physical_height: ph,
                    });
                }
            }
        }

        if capture_infos.is_empty() {
            return Err("Failed to initialize capture items for any monitor".to_string());
        }

        let total_pw = (max_px - min_px) as u32;
        let total_ph = (max_py - min_py) as u32;

        if total_pw == 0 || total_ph == 0 {
            return Err("Calculated physical dimensions are zero".to_string());
        }

        // Final physical canvas - allocated at native resolution to prevent row-wrap alignment issues
        let mut full_desktop_rgb = vec![0u8; (total_pw * total_ph * 3) as usize];

        // 1. Create D3D11 Device
        let mut d3d_device: Option<ID3D11Device> = None;
        let mut d3d_context: Option<ID3D11DeviceContext> = None;

        let mut hr = D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut d3d_device),
            None,
            Some(&mut d3d_context),
        );

        if hr.is_err() {
            // Fallback to WARP (software rasterizer) if HW fails
            hr = D3D11CreateDevice(
                None,
                D3D_DRIVER_TYPE_WARP,
                HMODULE::default(),
                D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                None,
                D3D11_SDK_VERSION,
                Some(&mut d3d_device),
                None,
                Some(&mut d3d_context),
            );
        }

        if hr.is_err() {
            return Err(format!("Failed to create D3D11 device: {:?}", hr));
        }

        let d3d_device = d3d_device.unwrap();
        let d3d_context = d3d_context.unwrap();

        // 2. Wrap D3D11 Device into a WinRT IDirect3DDevice
        let dxgi_device: IDXGIDevice = d3d_device
            .cast()
            .map_err(|e| format!("Cast to IDXGIDevice: {e}"))?;
        let inspectable: IInspectable = CreateDirect3D11DeviceFromDXGIDevice(&dxgi_device)
            .map_err(|e| format!("CreateDirect3D11DeviceFromDXGIDevice: {e}"))?;
        let winrt_d3d_device: IDirect3DDevice = inspectable
            .cast()
            .map_err(|e| format!("Cast to IDirect3DDevice: {e}"))?;

        // 4. Capture each monitor using WGC
        let mut any_success = false;
        for info in &capture_infos {
            let item = &info.item;
            let item_size = item.Size().map_err(|e| format!("item.Size failed: {e}"))?;
            let fw = item_size.Width as u32;
            let fh = item_size.Height as u32;
            let hmonitor = info.hmonitor;

            // Create Frame Pool
            let frame_pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
                &winrt_d3d_device,
                DirectXPixelFormat::B8G8R8A8UIntNormalized,
                3,
                item_size,
            )
            .map_err(|e| format!("CreateFreeThreaded failed: {e}"))?;

            let session = frame_pool
                .CreateCaptureSession(item)
                .map_err(|e| format!("CreateCaptureSession failed: {e}"))?;
            session.SetIsCursorCaptureEnabled(false).ok();

            // Set up an event handler for FrameArrived
            let (tx, rx) = mpsc::channel::<(Vec<u8>, u32, u32)>();

            // To safely pass D3D device components, we must clone handles
            let d3d_device_clone = d3d_device.clone();
            let d3d_context_clone = d3d_context.clone();

            let frame_counter = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));

            let handler = windows::Foundation::TypedEventHandler::<
                Direct3D11CaptureFramePool,
                IInspectable,
            >::new(move |sender_pool, _| {
                if let Some(pool) = &*sender_pool {
                    if let Ok(frame) = pool.TryGetNextFrame() {
                        let count =
                            frame_counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;

                        // Skip first two frames completely
                        if count < 3 {
                            return Ok(());
                        }

                        if let Ok(surface) = frame.Surface() {
                            // Extract ID3D11Texture2D from surface
                            let access = surface.cast::<windows::Win32::System::WinRT::Direct3D11::IDirect3DDxgiInterfaceAccess>().unwrap();

                            if let Ok(gpu_texture) = access.GetInterface::<ID3D11Texture2D>() {
                                {
                                    // We need to copy this GPU texture to a CPU-readable staging texture
                                    let content_size = frame.ContentSize().unwrap();

                                    let mut desc = D3D11_TEXTURE2D_DESC::default();
                                    desc.Width = content_size.Width as u32;
                                    desc.Height = content_size.Height as u32;
                                    desc.MipLevels = 1;
                                    desc.ArraySize = 1;
                                    desc.Format = windows::Win32::Graphics::Dxgi::Common::DXGI_FORMAT_B8G8R8A8_UNORM;
                                    desc.SampleDesc.Count = 1;
                                    desc.SampleDesc.Quality = 0;
                                    desc.Usage = D3D11_USAGE_STAGING;
                                    desc.BindFlags = 0;
                                    desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
                                    desc.MiscFlags = 0;

                                    let mut staging_opt: Option<ID3D11Texture2D> = None;
                                    let hr = d3d_device_clone.CreateTexture2D(
                                        &desc,
                                        None,
                                        Some(&mut staging_opt),
                                    );

                                    if hr.is_ok() {
                                        if let Some(staging) = staging_opt {
                                            d3d_context_clone.CopyResource(&staging, &gpu_texture);

                                            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
                                            let map_hr = d3d_context_clone.Map(
                                                &staging,
                                                0,
                                                D3D11_MAP_READ,
                                                0,
                                                Some(&mut mapped),
                                            );

                                            if map_hr.is_ok() {
                                                let row_pitch = mapped.RowPitch as usize;
                                                let content_size = frame.ContentSize().unwrap();
                                                let width = content_size.Width as usize;
                                                let height = content_size.Height as usize;

                                                let src = mapped.pData as *const u8;
                                                let mut bgra = vec![0u8; width * height * 4];

                                                // CRITICAL: row-by-row copy using RowPitch
                                                for y in 0..height {
                                                    let src_row = src.add(y * row_pitch);
                                                    let dst_row =
                                                        bgra.as_mut_ptr().add(y * width * 4);
                                                    std::ptr::copy_nonoverlapping(
                                                        src_row,
                                                        dst_row,
                                                        width * 4,
                                                    );
                                                }

                                                let _ = d3d_context_clone.Unmap(&staging, 0);

                                                // Convert dense contiguous BGRA to RGB
                                                let mut rgb_buf =
                                                    Vec::with_capacity(width * height * 3);
                                                for i in 0..(width * height) {
                                                    let base = i * 4;
                                                    rgb_buf.push(bgra[base + 2]); // R
                                                    rgb_buf.push(bgra[base + 1]); // G
                                                    rgb_buf.push(bgra[base + 0]);
                                                    // B
                                                }

                                                let _ =
                                                    tx.send((rgb_buf, width as u32, height as u32));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Ok(())
            });

            let token = frame_pool
                .FrameArrived(&handler)
                .map_err(|e| format!("FrameArrived event hook failed: {e}"))?;
            session
                .StartCapture()
                .map_err(|e| format!("StartCapture failed: {e}"))?;

            // Manual message pump for 3000ms since COM/WinRT events require an active thread queue
            let start = std::time::Instant::now();
            let mut captured_frame = None;

            // Short grace period for D3D to settle
            std::thread::sleep(Duration::from_millis(200));

            while start.elapsed() < Duration::from_millis(3000) {
                // Pump messages
                {
                    let mut msg = windows::Win32::UI::WindowsAndMessaging::MSG::default();
                    while windows::Win32::UI::WindowsAndMessaging::PeekMessageW(
                        &mut msg,
                        None,
                        0,
                        0,
                        windows::Win32::UI::WindowsAndMessaging::PM_REMOVE,
                    )
                    .as_bool()
                    {
                        windows::Win32::UI::WindowsAndMessaging::TranslateMessage(&msg);
                        windows::Win32::UI::WindowsAndMessaging::DispatchMessageW(&msg);
                    }
                }

                // Check if frame arrived
                if let Ok((rgb_data, fw, fh)) = rx.try_recv() {
                    captured_frame = Some((rgb_data, fw, fh));
                    break;
                }

                std::thread::sleep(Duration::from_millis(10));
            }

            if let Some((rgb_data, fw, fh)) = captured_frame {
                // --- SINGLE MONITOR DIRECT PATH ---
                // If we only have one monitor, bypass all stitching logic to prevent rounding/stride errors.
                if capture_infos.len() == 1 {
                    log::info!("[screenshot] Single monitor direct path: {}x{}", fw, fh);

                    // Direct sanity check for blank frame
                    let mut is_blank = true;
                    if rgb_data.len() >= 3 {
                        let first_r = rgb_data[0];
                        let first_g = rgb_data[1];
                        let first_b = rgb_data[2];
                        for i in (0..rgb_data.len()).step_by(3) {
                            if rgb_data[i] != first_r
                                || rgb_data[i + 1] != first_g
                                || rgb_data[i + 2] != first_b
                            {
                                is_blank = false;
                                break;
                            }
                        }
                    }
                    if is_blank {
                        return Err(
                            "Captured a completely blank solid frame (Direct Path)".to_string()
                        );
                    }

                    let mut jpeg_data = Vec::new();
                    let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_data, 40);
                    encoder
                        .encode(&rgb_data, fw, fh, image::ColorType::Rgb8.into())
                        .map_err(|e| format!("JPEG encoding failed: {e}"))?;

                    log::info!(
                        "[screenshot] Direct path success: {} KB",
                        jpeg_data.len() / 1024
                    );
                    return Ok(jpeg_data);
                }

                // --- MULTI-MONITOR STITCHING PATH ---
                let lw = info.logical_width;
                let lh = info.logical_height;

                let sx = if lw > 0 { fw as f64 / lw as f64 } else { 1.0 };
                let sy = if lh > 0 { fh as f64 / lh as f64 } else { 1.0 };

                // Re-calculate mapping
                let start_px = ((info.logical_x - vx) as f64 * sx).round() as i32 - min_px;
                let start_py = ((info.logical_y - vy) as f64 * sy).round() as i32 - min_py;

                let start_px = start_px.max(0) as usize;
                let start_py = start_py.max(0) as usize;

                let canvas_stride = total_pw as usize;
                let monitor_stride = fw as usize;

                for r in 0..fh as usize {
                    let dest_y = start_py + r;
                    if dest_y >= total_ph as usize {
                        continue;
                    }

                    let dest_row_start = dest_y * canvas_stride * 3;
                    let src_row_start = r * monitor_stride * 3;

                    for c in 0..fw as usize {
                        let dest_x = start_px + c;
                        if dest_x >= canvas_stride {
                            continue;
                        }

                        let s_idx = src_row_start + (c * 3);
                        let d_idx = dest_row_start + (dest_x * 3);

                        if d_idx + 2 < full_desktop_rgb.len() && s_idx + 2 < rgb_data.len() {
                            full_desktop_rgb[d_idx] = rgb_data[s_idx];
                            full_desktop_rgb[d_idx + 1] = rgb_data[s_idx + 1];
                            full_desktop_rgb[d_idx + 2] = rgb_data[s_idx + 2];
                        }
                    }
                }
                any_success = true;
            } else {
                log::warn!("[wgc] FrameArrived timed out for monitor {:?}", hmonitor);
            }

            // Clean up resources for this monitor
            let _ = frame_pool.RemoveFrameArrived(token);
            let _ = session.Close();
            let _ = frame_pool.Close();
        }

        if !any_success {
            return Err(
                "WGC failed to capture any frames on all monitors within timeout".to_string(),
            );
        }

        // Final sanity check for blank frame (DRM block still possible but EXTREMELY rare on WGC)
        let mut is_blank = true;
        let first_r = full_desktop_rgb[0];
        let first_g = full_desktop_rgb[1];
        let first_b = full_desktop_rgb[2];
        for i in (0..full_desktop_rgb.len()).step_by(3) {
            if full_desktop_rgb[i] != first_r
                || full_desktop_rgb[i + 1] != first_g
                || full_desktop_rgb[i + 2] != first_b
            {
                is_blank = false;
                break;
            }
        }

        if is_blank {
            return Err("WGC captured a completely blank solid frame (possible DRM)".to_string());
        }

        // Encode to JPEG - LOW QUALITY FOR UNSTABLE HOTSPOT
        let mut jpeg_data = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_data, 40);
        encoder
            .encode(
                &full_desktop_rgb,
                total_pw,
                total_ph,
                image::ColorType::Rgb8.into(),
            )
            .map_err(|e| format!("JPEG encoding failed: {e}"))?;

        log::info!(
            "[screenshot] WGC capture success: {} KB (Quality: 40%)",
            jpeg_data.len() / 1024
        );

        Ok(jpeg_data)
    }
}
