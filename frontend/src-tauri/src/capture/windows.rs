#[cfg(target_os = "windows")]
use windows_capture::{
    capture::GraphicsCaptureApiHandler,
    frame::Frame,
    graphics_capture_api::InternalCaptureControl,
    monitor::Monitor,
    settings::{CaptureSettings, CursorCaptureSettings, DrawBorderSettings},
};

use image::{ImageBuffer, Rgb};
use std::sync::mpsc::channel;

pub fn capture_desktop() -> Result<Vec<u8>, String> {
    struct CaptureHandler {
        sender: std::sync::mpsc::Sender<Vec<u8>>,
    }

    impl GraphicsCaptureApiHandler for CaptureHandler {
        type Flags = ();

        type Error = Box<dyn std::error::Error + Send + Sync>;

        fn new(
            sender: std::sync::mpsc::Sender<Vec<u8>>,
            _: InternalCaptureControl<Self::Flags>,
        ) -> Result<Self, Self::Error> {
            Ok(Self { sender })
        }

        fn on_frame_arrived(
            &mut self,
            frame: &mut Frame,
            _: InternalCaptureControl<Self::Flags>,
        ) -> Result<(), Self::Error> {
            let buffer = frame.buffer()?;

            let width = frame.width();
            let height = frame.height();

            let mut rgb = Vec::with_capacity((width * height * 3) as usize);

            for chunk in buffer.chunks_exact(4) {
                rgb.push(chunk[2]);
                rgb.push(chunk[1]);
                rgb.push(chunk[0]);
            }

            let mut jpeg = Vec::new();

            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 40).encode(
                &rgb,
                width,
                height,
                image::ColorType::Rgb8,
            )?;

            let _ = self.sender.send(jpeg);

            Ok(())
        }
    }

    let monitor = Monitor::primary().map_err(|e| e.to_string())?;

    let settings = CaptureSettings::new(
        monitor,
        CursorCaptureSettings::WithoutCursor,
        DrawBorderSettings::WithoutBorder,
        CaptureHandler,
    );

    let (tx, rx) = channel();

    CaptureHandler::start(settings, tx).map_err(|e| e.to_string())?;

    rx.recv().map_err(|e| e.to_string())
}
