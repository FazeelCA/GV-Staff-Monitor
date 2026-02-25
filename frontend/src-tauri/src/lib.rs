mod api;
mod screenshot;
mod state;
mod window;
mod windows_capture;

use state::{AppState, WorkState};
use std::sync::Arc;
use tauri::State;
use tokio::sync::oneshot;
use tokio::time::{interval, Duration};
use std::sync::atomic::{AtomicUsize, Ordering};
use device_query::{DeviceQuery, DeviceState};

lazy_static::lazy_static! {
    static ref ACTIVITY_COUNT: AtomicUsize = AtomicUsize::new(0);
}

fn start_rdev_listener() {
    std::thread::spawn(|| {
        log::info!("[input_tracker] Starting global input polling with device_query...");
        let device_state = DeviceState::new();
        let mut last_mouse = device_state.get_mouse().coords;
        let mut last_keys = device_state.get_keys();
        
        loop {
            std::thread::sleep(Duration::from_millis(100)); // Poll every 100ms
            
            // Check mouse movement and clicks
            let mouse = device_state.get_mouse();
            let mut active = false;
            
            if mouse.coords != last_mouse {
                active = true;
                last_mouse = mouse.coords;
            } else if mouse.button_pressed.iter().any(|&b| b) {
                active = true;
            }

            // Check keys
            let keys = device_state.get_keys();
            if keys != last_keys {
                active = true;
                last_keys = keys;
            }

            if active {
                ACTIVITY_COUNT.fetch_add(1, Ordering::Relaxed);
            }
        }
    });
}

// ─────────────────────────────────────────────
// macOS Screen Recording Permission
// ─────────────────────────────────────────────

/// Check if Screen Recording permission is granted.
/// On macOS 10.15+, this also triggers the system permission prompt
/// the first time it's called (so the user sees the dialog).
/// Returns true if permission is granted, false otherwise.
#[tauri::command]
fn check_screen_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // Use screencapture -x to test access; if it fails (non-zero exit), permission denied
        // We also use CGRequestScreenCaptureAccess via osascript approach
        let status = Command::new("screencapture")
            .args(["-x", "-t", "png", "/tmp/gv_perm_test.png"])
            .status();
        let _ = std::fs::remove_file("/tmp/gv_perm_test.png");
        match status {
            Ok(s) => s.success(),
            Err(_) => false,
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Open System Preferences → Screen Recording so user can grant access.
#[tauri::command]
fn open_screen_privacy_settings() {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
            .spawn();
    }
}

// ─────────────────────────────────────────────
// Shared state type alias
// ─────────────────────────────────────────────
type SharedState = Arc<AppState>;

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

/// Spawn the 60-second screenshot loop.
/// The loop now holds a reference to SharedState to read current task & auth on every tick.
fn spawn_screenshot_loop(app_state: SharedState) -> oneshot::Sender<()> {
    let (tx, mut rx) = oneshot::channel::<()>();
    
    tokio::spawn(async move {
        // Run every 60s
        let mut ticker = interval(Duration::from_secs(60));
        // Skip immediate first tick
        ticker.tick().await;

        // Report that the screenshot loop has started
        {
            let uid = app_state.user_id.lock().unwrap().clone().unwrap_or_default();
            if !uid.is_empty() {
                let uid_clone = uid.clone();
                tokio::spawn(async move {
                    api::report_error("screenshot_loop", "Screenshot loop started successfully", &uid_clone).await;
                });
            }
        }

        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    // 1. Capture screenshot on a BLOCKING thread (required for Windows COM/DXGI)
                    let cap_result = tokio::task::spawn_blocking(|| {
                        screenshot::capture_screenshot()
                    }).await;
                    
                    let capture = match cap_result {
                        Ok(inner) => inner,
                        Err(e) => {
                            let msg = format!("spawn_blocking panicked: {e}");
                            log::error!("[screenshot] {msg}");
                            
                            // Send to frontend for user visible debugging
                            if let Some(handle) = app_state.app_handle.lock().unwrap().as_ref() {
                                let _ = handle.emit("app-error", format!("WGC PANIC: {msg}"));
                            }
                            
                            let uid = app_state.user_id.lock().unwrap().clone().unwrap_or_default();
                            let msg_clone = msg.clone();
                            tokio::spawn(async move {
                                api::report_error("screenshot_panic", &msg_clone, &uid).await;
                            });
                            continue;
                        }
                    };
                    
                    match capture {
                        Ok((bytes, hash)) => {
                            // 2. Read current context from state locks
                            let (task, token, user_id) = {
                                let t_guard = app_state.current_task.lock().unwrap();
                                let tok_guard = app_state.auth_token.lock().unwrap();
                                let uid_guard = app_state.user_id.lock().unwrap();
                                
                                (
                                    t_guard.clone(), 
                                    tok_guard.clone().unwrap_or_default(), 
                                    uid_guard.clone().unwrap_or_default()
                                )
                            };

                            // 3. Upload if authenticated
                            if !token.is_empty() && !user_id.is_empty() {
                                // Reset the counter for the next interval
                                let current_activity = ACTIVITY_COUNT.swap(0, Ordering::Relaxed);
                                tokio::spawn(async move {
                                    api::upload_screenshot(bytes, hash, task, user_id, token, current_activity).await;
                                });
                            } else {
                                log::warn!("[screenshot] skipped upload: missing auth token/user_id");
                            }
                        }
                        Err(e) => {
                            log::error!("[screenshot] Error: {e}");
                            let uid = app_state.user_id.lock().unwrap().clone().unwrap_or_default();
                            let err_msg = e.clone();
                            tokio::spawn(async move {
                                api::report_error("screenshot_capture", &err_msg, &uid).await;
                            });
                        },
                    }
                }
                _ = &mut rx => {
                    log::info!("[screenshot] Loop cancelled.");
                    break;
                }
            }
        }
    });

    tx
}

fn spawn_activity_loop(app_state: SharedState) -> oneshot::Sender<()> {
    let (tx, mut rx) = oneshot::channel::<()>();
    
    tokio::spawn(async move {
        // Run every 5s
        let mut ticker = interval(Duration::from_secs(5));
        ticker.tick().await;

        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    // 1. Get active window
                    if let Some(win) = window::get_current_window() {
                        // 2. Read auth context
                        let (token, user_id, status) = {
                            let tok = app_state.auth_token.lock().unwrap();
                            let uid = app_state.user_id.lock().unwrap();
                            let s = app_state.work_state.lock().unwrap();
                            (tok.clone().unwrap_or_default(), uid.clone().unwrap_or_default(), s.clone())
                        };

                        // 3. Log if authenticated and WORKING
                        if !token.is_empty() && !user_id.is_empty() && status == WorkState::Working {
                            tokio::spawn(async move {
                                api::log_activity(win.title, win.app_name, win.url, user_id, token).await;
                            });
                        }
                    }
                }
                _ = &mut rx => {
                    break;
                }
            }
        }
    });

    tx
}

/// Stop the running screenshot loop (if any).
fn stop_loop(state: &AppState) {
    {
        let mut guard = state.screenshot_stop_tx.lock().unwrap();
        *guard = None; // Dropping sender cancels loop
    }
    {
        let mut guard = state.activity_stop_tx.lock().unwrap();
        *guard = None; 
    }
}

// ─────────────────────────────────────────────
// Tauri Commands
// ─────────────────────────────────────────────

#[tauri::command]
async fn set_auth(token: String, user_id: String, state: State<'_, SharedState>) -> Result<(), String> {
    let app_state = state.inner();
    {
        let mut t = app_state.auth_token.lock().unwrap();
        *t = Some(token);
    }
    {
        let mut u = app_state.user_id.lock().unwrap();
        *u = Some(user_id.clone());
    }
    log::info!("[auth] Credentials updated for user_id: {}", user_id);
    Ok(())
}

#[tauri::command]
async fn start_work(task: String, state: State<'_, SharedState>) -> Result<String, String> {
    let app_state = state.inner().clone();

    // Update state
    {
        let mut ws = app_state.work_state.lock().unwrap();
        *ws = WorkState::Working;
        let mut ct = app_state.current_task.lock().unwrap();
        *ct = task.clone();
    }

    // Start screenshot loop
    let tx = spawn_screenshot_loop(app_state.clone());
    {
        let mut guard = app_state.screenshot_stop_tx.lock().unwrap();
        *guard = Some(tx);
    }
    
    // Start activity loop
    let atx = spawn_activity_loop(app_state.clone());
    {
        let mut guard = app_state.activity_stop_tx.lock().unwrap();
        *guard = Some(atx);
    }

    // Fire API event
    let (token, uid) = {
        let t = app_state.auth_token.lock().unwrap().clone().unwrap_or_default();
        let u = app_state.user_id.lock().unwrap().clone().unwrap_or_default();
        (t, u)
    };

    if !token.is_empty() {
        tokio::spawn(async move {
            api::log_time_event("Working", &task, &uid, &token).await;
        });
    }

    Ok("Working".to_string())
}

#[tauri::command]
async fn take_break(state: State<'_, SharedState>) -> Result<String, String> {
    let app_state = state.inner().clone();
    
    // Update state
    let task = {
        let mut ws = app_state.work_state.lock().unwrap();
        *ws = WorkState::OnBreak;
        app_state.current_task.lock().unwrap().clone()
    };

    // Stop screenshots
    stop_loop(&app_state);

    // Fire API event
    let (token, uid) = {
        let t = app_state.auth_token.lock().unwrap().clone().unwrap_or_default();
        let u = app_state.user_id.lock().unwrap().clone().unwrap_or_default();
        (t, u)
    };

    if !token.is_empty() {
        tokio::spawn(async move {
            api::log_time_event("OnBreak", &task, &uid, &token).await;
        });
    }

    Ok("OnBreak".to_string())
}

#[tauri::command]
async fn stop_work(state: State<'_, SharedState>) -> Result<String, String> {
    let app_state = state.inner().clone();
    
    // Update state
    let task = {
        let mut ws = app_state.work_state.lock().unwrap();
        *ws = WorkState::Offline;
        app_state.current_task.lock().unwrap().clone()
    };

    // Stop screenshots
    stop_loop(&app_state);

    // Fire API event
    let (token, uid) = {
        let t = app_state.auth_token.lock().unwrap().clone().unwrap_or_default();
        let u = app_state.user_id.lock().unwrap().clone().unwrap_or_default();
        (t, u)
    };

    if !token.is_empty() {
        tokio::spawn(async move {
            api::log_time_event("Offline", &task, &uid, &token).await;
        });
    }

    Ok("Offline".to_string())
}

#[tauri::command]
async fn resume_work(state: State<'_, SharedState>) -> Result<String, String> {
    let app_state = state.inner().clone();
    
    // Update state
    let task = {
        let mut ws = app_state.work_state.lock().unwrap();
        *ws = WorkState::Working;
        app_state.current_task.lock().unwrap().clone()
    };

    // Restart screenshots
    let tx = spawn_screenshot_loop(app_state.clone());
    {
        let mut guard = app_state.screenshot_stop_tx.lock().unwrap();
        *guard = Some(tx);
    }

    // Restart activity
    let atx = spawn_activity_loop(app_state.clone());
    {
        let mut guard = app_state.activity_stop_tx.lock().unwrap();
        *guard = Some(atx);
    }

    // Fire API event
    let (token, uid) = {
        let t = app_state.auth_token.lock().unwrap().clone().unwrap_or_default();
        let u = app_state.user_id.lock().unwrap().clone().unwrap_or_default();
        (t, u)
    };

    if !token.is_empty() {
        tokio::spawn(async move {
            api::log_time_event("Working", &task, &uid, &token).await;
        });
    }

    Ok("Working".to_string())
}

#[tauri::command]
async fn update_task(task: String, state: State<'_, SharedState>) -> Result<(), String> {
    let app_state = state.inner().clone();

    // Update state
    let work_state_str = {
        let mut ct = app_state.current_task.lock().unwrap();
        *ct = task.clone();
        app_state.work_state.lock().unwrap().to_string()
    };

    // Fire log only if Working
    if work_state_str == "Working" {
        let (token, uid) = {
            let t = app_state.auth_token.lock().unwrap().clone().unwrap_or_default();
            let u = app_state.user_id.lock().unwrap().clone().unwrap_or_default();
            (t, u)
        };
        
        if !token.is_empty() {
            tokio::spawn(async move {
                api::log_time_event(&work_state_str, &task, &uid, &token).await;
            });
        }
    }

    Ok(())
}

// ─────────────────────────────────────────────
// Tauri App Entry
// ─────────────────────────────────────────────

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared_state: SharedState = Arc::new(AppState::new());

    tauri::Builder::default()
        .setup(|app| {
            // Store app_handle for cross-thread emission (e.g. from screenshot loop)
            {
                let state = app.state::<SharedState>();
                let mut handle_guard = state.app_handle.lock().unwrap();
                *handle_guard = Some(app.handle().clone());
            }

            // Spawn the input tracker thread globally when the app starts
            start_rdev_listener();

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .manage(shared_state)
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { .. } => {
                if let Some(state) = window.try_state::<SharedState>() {
                    let (token, uid, task, _work_state_val) = {
                        let mut ws = state.work_state.lock().unwrap();
                        let current_ws = ws.clone();
                        *ws = WorkState::Offline;

                        let ct = state.current_task.lock().unwrap().clone();
                        let t = state.auth_token.lock().unwrap().clone().unwrap_or_default();
                        let u = state.user_id.lock().unwrap().clone().unwrap_or_default();
                        (t, u, ct, current_ws)
                    };

                    if !token.is_empty() {
                        api::log_time_event_sync("Offline", &task, &uid, &token);
                    }
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            set_auth,
            start_work,
            take_break,
            stop_work,
            resume_work,
            update_task,
            check_screen_permission,
            open_screen_privacy_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
