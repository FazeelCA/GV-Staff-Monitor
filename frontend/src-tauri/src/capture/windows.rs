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
    }

    impl GraphicsCaptureApiHandler for CaptureHandler {

        type Flags = Sender<Vec<u8>>;
        type Error = Box<dyn std::error::Error + Send + Sync>;

        fn new(
            ctx: Context<Self::Flags>,
        ) -> Result<Self, Self::Error> {
            Ok(Self { sender: ctx.flags })
        }

        fn on_frame_arrived(
            &mut self,
            frame: &mut Frame,
            mut control: InternalCaptureControl,
        ) -> Result<(), Self::Error> {

            let mut buffer = frame.buffer()?;
            let nopadding = buffer.as_nopadding_buffer()?;

            let width = frame.width();
            let height = frame.height();

            let mut rgb = Vec::with_capacity((width * height * 3) as usize);

            for chunk in nopadding.chunks_exact(4) {
                rgb.push(chunk[2]);
                rgb.push(chunk[1]);
                rgb.push(chunk[0]);
            }

            let mut jpeg = Vec::new();

            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 40)
                .encode(
                    &rgb,
                    width,
                    height,
                    image::ColorType::Rgb8.into(),
                )?;

            let _ = self.sender.send(jpeg);

            // CRITICAL: STOP CAPTURE AFTER FIRST FRAME
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
