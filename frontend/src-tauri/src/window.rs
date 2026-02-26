use active_win_pos_rs::get_active_window;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ActiveWindow {
    pub title: String,
    pub app_name: String,
    pub url: String, // Made non-optional string for simplicity in JSON, default empty
}

pub fn get_current_window() -> Option<ActiveWindow> {
    match get_active_window() {
        Ok(window) => {
            // Note: active-win-pos-rs 0.8 returns struct with title, app_name, etc.
            // On macOS, it relies on accessibility API.
            // We'll set URL to empty string for now as the crate doesn't easily expose URL for all browsers.
            // To get URL we usually need AppleScript for specific browsers (Safari, Chrome).
            // For MVP, we stick to window title which usually contains page title.

            Some(ActiveWindow {
                title: window.title,
                app_name: window.app_name,
                url: "".to_string(),
            })
        }
        Err(e) => {
            log::warn!("Active window error: {:?}", e);
            None
        }
    }
}
