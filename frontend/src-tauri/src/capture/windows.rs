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
            // WARMUP: Skip first 10 frames to let the GPU fully compose
            // and stabilize the color format conversion pipeline.
            self.frame_count += 1;
            if self.frame_count <= 10 {
                return Ok(());
            }

            let width = frame.width() as usize;
            let height = frame.height() as usize;

            let mut gpu_buffer = frame.buffer()?;

            // Use row_pitch to handle GPU memory padding
            let row_pitch = gpu_buffer.row_pitch() as usize;

            let raw = gpu_buffer.as_raw_buffer();

            // Use the frame's built-in save to get a guaranteed-correct image.
            // If that fails, fall back to manual row-pitch extraction.
            let mut rgb = Vec::with_capacity(width * height * 3);

            for y in 0..height {
                let row_start = y * row_pitch;
                let row_end = row_start + width * 4;

                // Safety: ensure we don't read past the buffer
                if row_end > raw.len() {
                    break;
                }

                let row = &raw[row_start..row_end];

                for pixel in row.chunks_exact(4) {
                    // Rgba8 format: pixel = [R, G, B, A]
                    rgb.push(pixel[0]); // R
                    rgb.push(pixel[1]); // G
                    rgb.push(pixel[2]); // B
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
        ColorFormat::Rgba8, // Use native RGBA format — avoids Intel partial BGRA conversion bug
        tx,
    );

    CaptureHandler::start(settings).map_err(|e| e.to_string())?;

    rx.recv().map_err(|e| e.to_string())
}
