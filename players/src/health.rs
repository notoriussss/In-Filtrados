use axum::{
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Serialize;
use std::{collections::HashMap, env, time::Duration};
use tokio::net::TcpStream;
use tokio::time::timeout;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
    pub checks: HashMap<String, String>,
}

pub async fn check_tcp(addr: &str) -> Result<(), String> {
    let host_port = extract_host_port(addr);
    match timeout(Duration::from_secs(1), TcpStream::connect(&host_port)).await {
        Ok(Ok(_stream)) => Ok(()),
        Ok(Err(e)) => Err(format!("fail: {}", e)),
        Err(_) => Err("fail: timeout (1s)".to_string()),
    }
}

fn extract_host_port(raw_url: &str) -> String {
    let mut s = raw_url;
    if let Some(pos) = s.find("://") {
        s = &s[pos + 3..];
    }
    if let Some(pos) = s.find('@') {
        s = &s[pos + 1..];
    }
    if let Some(pos) = s.find('/') {
        s = &s[..pos];
    }
    if let Some(pos) = s.find('?') {
        s = &s[..pos];
    }
    if !s.contains(':') {
        format!("{}:5434", s)
    } else {
        s.to_string()
    }
}

pub async fn health_handler() -> impl IntoResponse {
    let db_url = env::var("PLAYERS_DB_URL")
        .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5434/players_db".to_string());
    let rabbit_url = env::var("RABBITMQ_URL")
        .unwrap_or_else(|_| "amqp://guest:guest@localhost:5672/".to_string());

    let (db_res, rabbit_res) = tokio::join!(
        check_tcp(&db_url),
        check_tcp(&rabbit_url)
    );

    let mut checks = HashMap::new();
    checks.insert(
        "db".to_string(),
        db_res.map(|_| "ok".to_string()).unwrap_or_else(|e| e),
    );
    checks.insert(
        "rabbitmq".to_string(),
        rabbit_res.map(|_| "ok".to_string()).unwrap_or_else(|e| e),
    );

    let is_degraded = checks.values().any(|val| val != "ok");
    let status_str = if is_degraded { "degraded" } else { "ok" };
    let status_code = if is_degraded {
        StatusCode::SERVICE_UNAVAILABLE
    } else {
        StatusCode::OK
    };

    let response = HealthResponse {
        status: status_str.to_string(),
        service: "players".to_string(),
        checks,
    };

    (status_code, Json(response))
}
