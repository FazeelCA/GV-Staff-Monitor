#[cfg(target_os = "windows")]
use windows_capture::{
    capture::GraphicsCaptureApiHandler,
    frame::Frame,
    graphics_capture_api::InternalCaptureControl,
    monitor::Monitor,
    settings::{CaptureSettings, CursorCaptureSettings, DrawBorderSettings},
};

use std::sync::mpsc::{channel, Sender};

#[cfg(target_os = "windows")]
pub fn capture_desktop() -> Result<Vec<u8>, String> {
    struct CaptureHandler {
        sender: Sender<Vec<u8>>,
    }

    impl GraphicsCaptureApiHandler for CaptureHandler {
        type Flags = ();

        type Error = Box<dyn std::error::Error + Send + Sync>;

        fn new(
            sender: Sender<Vec<u8>>,
            _: InternalCaptureControl<Self::Flags>,
        ) -> Result<Self, Self::Error> {
            Ok(Self { sender })
        }

        fn on_frame_arrived(
            &mut self,
            frame: &mut Frame,
            mut control: InternalCaptureControl<Self::Flags>,
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

            // CRITICAL: STOP CAPTURE AFTER FIRST FRAME
            control.stop();

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
