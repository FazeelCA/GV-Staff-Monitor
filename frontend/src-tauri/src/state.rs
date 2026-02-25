use std::sync::Mutex;
use tokio::sync::oneshot;

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub enum WorkState {
    Offline,
    Working,
    OnBreak,
}

impl std::fmt::Display for WorkState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkState::Offline => write!(f, "Offline"),
            WorkState::Working => write!(f, "Working"),
            WorkState::OnBreak => write!(f, "OnBreak"),
        }
    }
}

pub struct AppState {
    pub work_state: Mutex<WorkState>,
    pub current_task: Mutex<String>,
    pub auth_token: Mutex<Option<String>>,
    pub user_id: Mutex<Option<String>>,
    pub app_handle: Mutex<Option<tauri::AppHandle>>,
    /// When Some, the screenshot loop is active. Dropping / sending cancels it.
    pub screenshot_stop_tx: Mutex<Option<oneshot::Sender<()>>>,
    /// When Some, activity loop is active.
    pub activity_stop_tx: Mutex<Option<oneshot::Sender<()>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            work_state: Mutex::new(WorkState::Offline),
            current_task: Mutex::new(String::new()),
            auth_token: Mutex::new(None),
            user_id: Mutex::new(None),
            app_handle: Mutex::new(None),
            screenshot_stop_tx: Mutex::new(None),
            activity_stop_tx: Mutex::new(None),
        }
    }
}
