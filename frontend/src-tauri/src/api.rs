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
pub async fn upload_screenshot(
    jpeg_bytes: Vec<u8>,
    hash: String,
    task: String,
    user_id: String,
    token: String,
    activity_count: usize,
) {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let size_kb = jpeg_bytes.len() / 1024;
    log::info!("[api] Starting upload of {} KB screenshot", size_kb);

    // Fire and forget a report so we can see the size on the server logs even if upload fails
    let user_id_clone = user_id.clone();
    tokio::spawn(async move {
        report_error(
            "screenshot_upload_init",
            &format!("Starting upload: {} KB", size_kb),
            &user_id_clone,
        )
        .await;
    });

    let mut attempts = 0;
    let max_attempts = 3;

    while attempts < max_attempts {
        attempts += 1;

        let part = multipart::Part::bytes(jpeg_bytes.clone())
            .file_name("screenshot.jpg")
            .mime_str("image/jpeg")
            .expect("valid mime");

        let form = multipart::Form::new()
            .text("hash", hash.clone())
            .text("activityCount", activity_count.to_string())
            .text("taskAtTheTime", task.clone())
            .text("userId", user_id.clone())
            .part("image", part);

        match client
            .post(format!("{BASE_URL}/api/screenshots/upload"))
            .header("Authorization", format!("Bearer {}", token))
            .multipart(form)
            .send()
            .await
        {
            Ok(resp) => {
                log::info!(
                    "[api] upload_screenshot (attempt {attempts}) -> {}",
                    resp.status()
                );
                if resp.status().is_success() {
                    return; // Success!
                } else {
                    if let Ok(text) = resp.text().await {
                        log::warn!("[api] upload failed with body: {}", text);
                    }
                }
            }
            Err(e) => log::warn!("[api] upload_screenshot (attempt {attempts}) failed: {e}"),
        }

        if attempts < max_attempts {
            // Wait before retry
            tokio::time::sleep(std::time::Duration::from_secs(5 * attempts as u64)).await;
        }
    }
}

#[derive(serde::Serialize)]
struct ActivityPayload {
    userId: String,
    title: String,
    appName: String,
    url: String,
}

pub async fn log_activity(
    title: String,
    app_name: String,
    url: String,
    user_id: String,
    token: String,
) {
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
        Ok(_) => {} // Silent success
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
        user_id,
        api_type,
        task,
        Utc::now().to_rfc3339()
    );

    let _ = std::process::Command::new("curl")
        .arg("--max-time")
        .arg("3") // prevent hanging shutdown
        .arg("-X")
        .arg("POST")
        .arg("-H")
        .arg("Content-Type: application/json")
        .arg("-H")
        .arg(format!("Authorization: Bearer {}", token))
        .arg("-d")
        .arg(&json_payload)
        .arg(format!("{BASE_URL}/api/time/log"))
        .status(); // block until curl finishes so the app doesn't exit before the request sends
}

/// POST /api/debug/report — send client-side errors to the server for remote diagnosis
pub async fn report_error(source: &str, message: &str, user_id: &str) {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "userId": user_id,
        "source": source,
        "message": message,
        "platform": std::env::consts::OS,
        "appVersion": "0.6.43",
    });

    let _ = client
        .post(format!("{BASE_URL}/api/debug/report"))
        .json(&body)
        .send()
        .await;
}
