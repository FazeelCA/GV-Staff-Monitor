use image::codecs::jpeg::JpegEncoder;
use sha2::{Digest, Sha256};
use std::io::Cursor;

// ─────────────────────────────────────────────────────────────────────────────
// Universal Fallback: xcap (GDI / CoreGraphics)
// ─────────────────────────────────────────────────────────────────────────────
fn capture_screen_xcap() -> Result<Vec<u8>, String> {
    let monitors =
        xcap::Monitor::all().map_err(|e| format!("xcap failed to enumerate monitors: {e}"))?;

    let monitor = match monitors
        .into_iter()
        .find(|m| m.is_primary().unwrap_or(false))
    {
        Some(m) => m,
        None => {
            let all = xcap::Monitor::all().map_err(|e| {
                format!("Primary monitor not found, and fallback Monitor::all() failed: {e}")
            })?;
            all.into_iter()
                .next()
                .ok_or_else(|| "No monitors detected by xcap on this system".to_string())?
        }
    };

    let image = monitor
        .capture_image()
        .map_err(|e| format!("xcap display capture failed completely: {e}"))?;

    let rgb_image = image::DynamicImage::ImageRgba8(image).to_rgb8();

    let mut buffer = Cursor::new(Vec::new());
    let mut encoder = JpegEncoder::new_with_quality(&mut buffer, 40);
    encoder
        .encode(
            rgb_image.as_raw(),
            rgb_image.width(),
            rgb_image.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| format!("JPEG encode failed: {e}"))?;

    Ok(buffer.into_inner())
}

// ─────────────────────────────────────────────────────────────────────────────
// Windows: Utilize Scrap (Native DXGI Desktop Duplication)
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
pub fn capture_screen(_app_handle: &tauri::AppHandle) -> Result<Vec<u8>, String> {
    use windows_capture::{
        capture::{Context, GraphicsCaptureApiHandler},
        frame::Frame,
        graphics_capture_api::InternalCaptureControl,
        monitor::Monitor,
        settings::{
            ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
            MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
        },
    };
    use std::sync::mpsc::{channel, Sender};

    struct CaptureHandler {
        sender: Sender<Vec<u8>>,
        frame_count: u32,
    }

    impl GraphicsCaptureApiHandler for CaptureHandler {
        type Flags = Sender<Vec<u8>>;
        type Error = Box<dyn std::error::Error + Send + Sync>;

        fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
            Ok(Self {
                sender: ctx.flags,
                frame_count: 0,
            })
        }

        fn on_frame_arrived(
            &mut self,
            frame: &mut Frame,
            control: InternalCaptureControl,
        ) -> Result<(), Self::Error> {
            // WARMUP: Skip first 5 frames to let GPU fully compose the buffer.
            self.frame_count += 1;
            if self.frame_count <= 5 {
                return Ok(());
            }

            let width = frame.width() as usize;
            let height = frame.height() as usize;

            let mut gpu_buffer = frame.buffer()?;
            let row_pitch = gpu_buffer.row_pitch() as usize;

            let mut rgb = Vec::with_capacity(width * height * 3);
            let raw = gpu_buffer.as_raw_buffer();

            for y in 0..height {
                let row_start = y * row_pitch;
                let row = &raw[row_start..row_start + width * 4];

                for pixel in row.chunks_exact(4) {
                    // BGRA → RGB
                    rgb.push(pixel[2]);
                    rgb.push(pixel[1]);
                    rgb.push(pixel[0]);
                }
            }

            let img = image::ImageBuffer::<image::Rgb<u8>, Vec<u8>>::from_raw(width as u32, height as u32, rgb)
                .ok_or("Failed to construct image buffer")?;
            
            let mut dyn_img = image::DynamicImage::ImageRgb8(img);

            // Scale to 720p
            if dyn_img.height() > 720 {
                let aspect_ratio = dyn_img.width() as f32 / dyn_img.height() as f32;
                let new_width = (720.0 * aspect_ratio) as u32;
                dyn_img = dyn_img.resize_exact(new_width, 720, image::imageops::FilterType::Triangle);
            }

            let mut jpeg = Vec::new();
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 50).encode(
                dyn_img.as_bytes(),
                dyn_img.width(),
                dyn_img.height(),
                image::ExtendedColorType::Rgb8,
            )?;

            let _ = self.sender.send(jpeg);
            control.stop();

            Ok(())
        }
    }

    let monitor = Monitor::primary().map_err(|e| e.to_string())?;
    let (tx, rx) = channel();

    let settings = Settings::new(
        monitor,
        CursorCaptureSettings::WithoutCursor,
        DrawBorderSettings::WithoutBorder,
        SecondaryWindowSettings::Default,
        MinimumUpdateIntervalSettings::Default,
        DirtyRegionSettings::Default,
        ColorFormat::Bgra8,
        tx,
    );

    CaptureHandler::start(settings).map_err(|e| e.to_string())?;

    rx.recv().map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// macOS/Linux: Fallback to xcap
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(not(target_os = "windows"))]
pub fn capture_screen(_app_handle: &tauri::AppHandle) -> Result<Vec<u8>, String> {
    capture_screen_xcap()
}

pub fn capture_screenshot(app_handle: &tauri::AppHandle) -> Result<(Vec<u8>, String), String> {
    let jpeg_bytes = capture_screen(app_handle)?;
    let mut hasher = Sha256::new();
    hasher.update(&jpeg_bytes);
    let hash = hex::encode(hasher.finalize());
    Ok((jpeg_bytes, hash))
}
