mod api;
mod screenshot;
mod state;
mod window;

use state::{AppState, WorkState};
use std::sync::Arc;
use tauri::State;
use tokio::sync::oneshot;
use tokio::time::{interval, Duration};

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

        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    // 1. Capture screenshot (blocking/sync usually, but fast)
                    match screenshot::capture_screenshot() {
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
                                tokio::spawn(async move {
                                    api::upload_screenshot(bytes, hash, task, user_id, token).await;
                                });
                            } else {
                                log::warn!("[screenshot] skipped upload: missing auth token/user_id");
                            }
                        }
                        Err(e) => log::error!("[screenshot] Error: {e}"),
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
                    let (token, uid, task, work_state_val) = {
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
