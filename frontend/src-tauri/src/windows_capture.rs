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
    use windows::Win32::Graphics::Direct3D::{
        D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_WARP,
    };
    use windows::Win32::Graphics::Direct3D11::{
        D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
        D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC,
        D3D11_USAGE_STAGING, D3D11_CPU_ACCESS_READ, D3D11_MAP_READ, D3D11_MAPPED_SUBRESOURCE,
    };
    use windows::Win32::Graphics::Dxgi::IDXGIDevice;
    use windows::Win32::Graphics::Gdi::{
        EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW,
    };
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
    use windows::Win32::System::WinRT::{
        CreateDirect3D11DeviceFromDXGIDevice, CreateDispatcherQueueController,
        DispatcherQueueOptions, DQTAT_COM_NONE, DQTYPE_THREAD_CURRENT,
    };
    use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
        SM_YVIRTUALSCREEN,
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
        let mut dq_controller = None;
        let _ = CreateDispatcherQueueController(dq_options, &mut dq_controller);

        // Calculate virtual screen dimensions for stitching if multi-monitor
        let vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let v_width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let v_height = GetSystemMetrics(SM_CYVIRTUALSCREEN);

        if v_width == 0 || v_height == 0 {
            return Err("Invalid virtual screen dimensions".to_string());
        }

        // Output buffer for the final stitched image
        let mut full_desktop_rgb = vec![0u8; (v_width * v_height * 3) as usize];

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
        let dxgi_device: IDXGIDevice = d3d_device.cast().map_err(|e| format!("Cast to IDXGIDevice: {e}"))?;
        let inspectable: IInspectable = CreateDirect3D11DeviceFromDXGIDevice(&dxgi_device).map_err(|e| format!("CreateDirect3D11DeviceFromDXGIDevice: {e}"))?;
        let winrt_d3d_device: IDirect3DDevice = inspectable.cast().map_err(|e| format!("Cast to IDirect3DDevice: {e}"))?;

        // 3. Enumerate Monitors
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

        // 4. Capture each monitor using WGC
        let mut any_success = false;
        let interop: IGraphicsCaptureItemInterop = windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>().map_err(|e| format!("Failed to get IGraphicsCaptureItemInterop: {e}"))?;

        for &hmonitor in &monitors {
            // Get Monitor Info (for coordinates)
            let mut mi = MONITORINFOEXW::default();
            mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
            if !GetMonitorInfoW(hmonitor, &mut mi as *mut _ as *mut MONITORINFO).as_bool() {
                continue;
            }

            let mx = mi.monitorInfo.rcMonitor.left;
            let my = mi.monitorInfo.rcMonitor.top;
            let mwidth = (mi.monitorInfo.rcMonitor.right - mi.monitorInfo.rcMonitor.left) as u32;
            let mheight = (mi.monitorInfo.rcMonitor.bottom - mi.monitorInfo.rcMonitor.top) as u32;

            if mwidth == 0 || mheight == 0 {
                continue;
            }

            // Create GraphicsCaptureItem for this Monitor
            let item_res = interop.CreateForMonitor::<GraphicsCaptureItem>(hmonitor);
            if item_res.is_err() {
                log::warn!("[wgc] CreateForMonitor failed for monitor {:?}", hmonitor);
                continue;
            }
            let item = item_res.unwrap();

            let item_size = item.Size().map_err(|e| format!("item.Size failed: {e}"))?;
            let width = item_size.Width as u32;
            let height = item_size.Height as u32;

            // Create Frame Pool
            let frame_pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
                &winrt_d3d_device,
                DirectXPixelFormat::B8G8R8A8UIntNormalized,
                1,
                item_size,
            ).map_err(|e| format!("CreateFreeThreaded failed: {e}"))?;

            let session = frame_pool.CreateCaptureSession(&item).map_err(|e| format!("CreateCaptureSession failed: {e}"))?;
            session.SetIsCursorCaptureEnabled(false).ok();

            // Set up an event handler for FrameArrived
            let (tx, rx) = mpsc::channel::<(Vec<u8>, u32, u32)>();
            
            // To safely pass D3D device components, we must clone handles
            let d3d_device_clone = d3d_device.clone();
            let d3d_context_clone = d3d_context.clone();

            let handler = windows::Foundation::TypedEventHandler::<Direct3D11CaptureFramePool, IInspectable>::new(
                move |sender_pool, _| {
                    if let Some(pool) = &*sender_pool {
                        if let Ok(frame) = pool.TryGetNextFrame() {
                            if let Ok(surface) = frame.Surface() {
                                // Extract ID3D11Texture2D from surface
                                let access = surface.cast::<windows::Win32::System::WinRT::Direct3D11::IDirect3DDxgiInterfaceAccess>().unwrap();
                                
                                if let Ok(gpu_texture) = unsafe { access.GetInterface::<ID3D11Texture2D>() } {
                                    unsafe {
                                        // We need to copy this GPU texture to a CPU-readable staging texture
                                        let mut desc = D3D11_TEXTURE2D_DESC::default();
                                        gpu_texture.GetDesc(&mut desc);
                                        
                                        desc.Usage = D3D11_USAGE_STAGING;
                                        desc.BindFlags = 0;
                                        desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
                                        desc.MiscFlags = 0;
                                        
                                        let mut staging_opt: Option<ID3D11Texture2D> = None;
                                        let hr = d3d_device_clone.CreateTexture2D(&desc, None, Some(&mut staging_opt));
                                        
                                        if hr.is_ok() {
                                            if let Some(staging) = staging_opt {
                                                d3d_context_clone.CopyResource(&staging, &gpu_texture);
                                                
                                                let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
                                                let map_hr = d3d_context_clone.Map(
                                                    &staging,
                                                    0,
                                                    D3D11_MAP_READ,
                                                    0,
                                                    Some(&mut mapped)
                                                );
                                                
                                                if map_hr.is_ok() {
                                                    let pitch = mapped.RowPitch as usize;
                                                    let mut rgb_buf = Vec::with_capacity((desc.Width * desc.Height * 3) as usize);
                                                    let data_ptr = mapped.pData as *const u8;
                                                    
                                                    for r in 0..desc.Height as usize {
                                                        let row_start = data_ptr.add(r * pitch);
                                                        for c in 0..desc.Width as usize {
                                                            let px = row_start.add(c * 4);
                                                            let b = *px;
                                                            let g = *px.add(1);
                                                            let r_val = *px.add(2);
                                                            rgb_buf.push(r_val);
                                                            rgb_buf.push(g);
                                                            rgb_buf.push(b);
                                                        }
                                                    }
                                                    
                                                    let _ = d3d_context_clone.Unmap(&staging, 0);
                                                    let _ = tx.send((rgb_buf, desc.Width, desc.Height));
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Ok(())
                },
            );

            let token = frame_pool.FrameArrived(&handler).map_err(|e| format!("FrameArrived event hook failed: {e}"))?;
            session.StartCapture().map_err(|e| format!("StartCapture failed: {e}"))?;

            // Manual message pump for 1500ms since COM/WinRT events require an active thread queue
            let start = std::time::Instant::now();
            let mut captured_frame = None;
            
            while start.elapsed() < Duration::from_millis(1500) {
                // Pump messages
                unsafe {
                    let mut msg = windows::Win32::UI::WindowsAndMessaging::MSG::default();
                    while windows::Win32::UI::WindowsAndMessaging::PeekMessageW(
                        &mut msg,
                        None,
                        0,
                        0,
                        windows::Win32::UI::WindowsAndMessaging::PM_REMOVE,
                    ).as_bool() {
                        windows::Win32::UI::WindowsAndMessaging::TranslateMessage(&msg);
                        windows::Win32::UI::WindowsAndMessaging::DispatchMessageW(&msg);
                    }
                }
                
                // Check if frame arrived
                if let Ok((rgb_data, fw, fh)) = rx.try_recv() {
                    captured_frame = Some((rgb_data, fw, fh));
                    break;
                }
                
                std::thread::sleep(Duration::from_millis(5));
            }

            if let Some((rgb_data, fw, fh)) = captured_frame {
                // Stitch local frame into global desktop canvas
                let start_x = mx - vx;
                let start_y = my - vy;
                
                for r in 0..fh as usize {
                    let dest_y = start_y as usize + r;
                    if dest_y >= v_height as usize { continue; }
                    
                    for c in 0..fw as usize {
                        let dest_x = start_x as usize + c;
                        if dest_x >= v_width as usize { continue; }
                        
                        let src_idx = (r * fw as usize + c) * 3;
                        let dest_idx = (dest_y * v_width as usize + dest_x) * 3;
                        
                        full_desktop_rgb[dest_idx] = rgb_data[src_idx];
                        full_desktop_rgb[dest_idx + 1] = rgb_data[src_idx + 1];
                        full_desktop_rgb[dest_idx + 2] = rgb_data[src_idx + 2];
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
            return Err("WGC failed to capture any frames on all monitors within timeout".to_string());
        }
        
        // Final sanity check for blank frame (DRM block still possible but EXTREMELY rare on WGC)
        let mut is_blank = true;
        let first_r = full_desktop_rgb[0];
        let first_g = full_desktop_rgb[1];
        let first_b = full_desktop_rgb[2];
        for i in (0..full_desktop_rgb.len()).step_by(3) {
            if full_desktop_rgb[i] != first_r || full_desktop_rgb[i+1] != first_g || full_desktop_rgb[i+2] != first_b {
                is_blank = false;
                break;
            }
        }
        
        if is_blank {
            return Err("WGC captured a completely blank solid frame (possible DRM)".to_string());
        }

        // Encode to JPEG
        let mut jpeg_data = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_data, 75);
        encoder
            .encode(&full_desktop_rgb, v_width as u32, v_height as u32, image::ColorType::Rgb8.into())
            .map_err(|e| format!("JPEG encoding failed: {e}"))?;

        log::info!("[screenshot] WGC capture success: {} KB", jpeg_data.len() / 1024);
        
        // CoUninitialize is generally handled by process death or thread bounds, but good practice
        // CoUninitialize(); 

        Ok(jpeg_data)
    }
}
