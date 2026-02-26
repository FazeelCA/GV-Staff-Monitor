#[cfg(target_os = "windows")]
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

#[cfg(target_os = "windows")]
pub fn capture_desktop() -> Result<Vec<u8>, String> {
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
            // Early frames contain uninitialized VRAM (red/pink garbage data).
            self.frame_count += 1;
            if self.frame_count <= 5 {
                return Ok(());
            }

            let width = frame.width() as usize;
            let height = frame.height() as usize;

            let mut gpu_buffer = frame.buffer()?;

            // CRITICAL FIX: USE ROW PITCH to handle GPU memory padding
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

            let mut jpeg = Vec::new();

            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 40).encode(
                &rgb,
                width as u32,
                height as u32,
                image::ColorType::Rgb8.into(),
            )?;

            let _ = self.sender.send(jpeg);

            // STOP CAPTURE after grabbing the stabilized frame
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
