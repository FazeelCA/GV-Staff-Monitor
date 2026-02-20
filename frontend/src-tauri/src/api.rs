use chrono::Utc;
use reqwest::multipart;

const BASE_URL: &str = "https://track.gallerydigital.in";

/// POST /api/time/log
pub async fn log_time_event(state: &str, task: &str, user_id: &str, token: &str) {
    let client = reqwest::Client::new();
    
    // Map Rust state to API type if needed, or use as is
    // Frontend uses: START, STOP, BREAK_START, BREAK_END
    // Rust uses: Working, OnBreak, Offline
    // We'll trust the frontend to handle the primary logic, 
    // but if we log here, we should probably match usage or generic "AUTO_LOG"
    let api_type = match state {
        "Working" => "START",
        "OnBreak" => "BREAK_START",
        "Offline" => "STOP",
        _ => "STOP",
    };

    let body = serde_json::json!({
        "userId": user_id,
        "type": api_type,
        "currentTask": task,
        "timestamp": Utc::now().to_rfc3339(),
    });

    match client
        .post(format!("{BASE_URL}/api/time/log"))
        .header("Authorization", format!("Bearer {}", token))
        .json(&body)
        .send()
        .await
    {
        Ok(resp) => log::info!("[api] log_time_event -> {}", resp.status()),
        Err(e) => log::warn!("[api] log_time_event failed: {e}"),
    }
}

/// POST /api/screenshots/upload
pub async fn upload_screenshot(jpeg_bytes: Vec<u8>, hash: String, task: String, user_id: String, token: String) {
    let client = reqwest::Client::new();

    let part = multipart::Part::bytes(jpeg_bytes)
        .file_name("screenshot.jpg")
        .mime_str("image/jpeg")
        .expect("valid mime");

    let form = multipart::Form::new()
        .part("image", part)
        .text("hash", hash)
        .text("task", task)
        .text("userId", user_id);

    match client
        .post(format!("{BASE_URL}/api/screenshots/upload"))
        .header("Authorization", format!("Bearer {}", token))
        .multipart(form)
        .send()
        .await
    {
        Ok(resp) => log::info!("[api] upload_screenshot -> {}", resp.status()),
        Err(e) => log::warn!("[api] upload_screenshot failed: {e}"),
    }
}

#[derive(serde::Serialize)]
struct ActivityPayload {
    userId: String,
    title: String,
    appName: String,
    url: String,
}

pub async fn log_activity(title: String, app_name: String, url: String, user_id: String, token: String) {
    let client = reqwest::Client::new();
    let payload = ActivityPayload {
        userId: user_id,
        title,
        appName: app_name,
        url,
    };

    match client
        .post(format!("{BASE_URL}/api/activity/log"))
        .header("Authorization", format!("Bearer {}", token))
        .json(&payload)
        .send()
        .await
    {
        Ok(_) => {}, // Silent success
        Err(e) => log::warn!("[api] log_activity failed: {e}"),
    }
}

/// A synchronous fire-and-forget fallback that uses standard `curl` executable 
/// to notify the server on app teardown (when tokio executor may be dropping).
pub fn log_time_event_sync(state: &str, task: &str, user_id: &str, token: &str) {
    let api_type = match state {
        "Working" => "START",
        "OnBreak" => "BREAK_START",
        "Offline" => "STOP",
        _ => "STOP",
    };

    let json_payload = format!(
        r#"{{"userId":"{}","type":"{}","currentTask":"{}","timestamp":"{}"}}"#,
        user_id, api_type, task, Utc::now().to_rfc3339()
    );

    let _ = std::process::Command::new("curl")
        .arg("-X")
        .arg("POST")
        .arg("-H")
        .arg("Content-Type: application/json")
        .arg("-H")
        .arg(format!("Authorization: Bearer {}", token))
        .arg("-d")
        .arg(&json_payload)
        .arg(format!("{BASE_URL}/api/time/log"))
        .spawn(); // execute detached
}
