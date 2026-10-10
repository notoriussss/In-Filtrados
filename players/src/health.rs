use axum::{http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, env, time::Duration};
use tokio::net::TcpStream;
use tokio::time::timeout;

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
    pub checks: HashMap<String, String>,
}

pub async fn check_tcp(addr: &str) -> Result<(), String> {
    let host_port = extract_host_port(addr);
    match timeout(Duration::from_secs(1), TcpStream::connect(&host_port)).await
    {
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
        format!("{}:5432", s)
    } else {
        s.to_string()
    }
}

pub fn build_health_response(
    db_res: Result<(), String>,
    rabbit_res: Result<(), String>,
) -> (StatusCode, HealthResponse) {
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

    (status_code, response)
}

pub async fn health_handler() -> (StatusCode, Json<HealthResponse>) {
    let db_future = async {
        match env::var("PLAYERS_DB_URL") {
            Ok(url) => check_tcp(&url).await,
            Err(_) => Err("fail: PLAYERS_DB_URL not set".to_string()),
        }
    };

    let rabbit_future = async {
        match env::var("RABBITMQ_URL") {
            Ok(url) => check_tcp(&url).await,
            Err(_) => Err("fail: RABBITMQ_URL not set".to_string()),
        }
    };

    let (db_res, rabbit_res) = tokio::join!(db_future, rabbit_future);
    let (status_code, response) = build_health_response(db_res, rabbit_res);

    (status_code, Json(response))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_host_port() {
        assert_eq!(
            extract_host_port("postgres://user:pass@localhost:5432/players_db"),
            "localhost:5432"
        );
        assert_eq!(
            extract_host_port("postgres://user:pass@db-host/players_db"),
            "db-host:5432"
        );
        assert_eq!(
            extract_host_port("amqp://guest:guest@localhost:5672/"),
            "localhost:5672"
        );
    }

    #[test]
    fn test_build_health_response_ok() {
        let (status_code, response) = build_health_response(Ok(()), Ok(()));
        assert_eq!(status_code, StatusCode::OK);
        assert_eq!(response.status, "ok");
        assert_eq!(response.service, "players");
        assert_eq!(response.checks.get("db").unwrap(), "ok");
        assert_eq!(response.checks.get("rabbitmq").unwrap(), "ok");
    }

    #[test]
    fn test_build_health_response_degraded() {
        let (status_code, response) = build_health_response(
            Err("fail: connection refused".to_string()),
            Ok(()),
        );
        assert_eq!(status_code, StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(response.status, "degraded");
        assert_eq!(response.service, "players");
        assert_eq!(
            response.checks.get("db").unwrap(),
            "fail: connection refused"
        );
        assert_eq!(response.checks.get("rabbitmq").unwrap(), "ok");
    }

    #[tokio::test]
    async fn test_health_handler_missing_env() {
        env::remove_var("PLAYERS_DB_URL");
        env::remove_var("RABBITMQ_URL");
        let (status_code, Json(response)) = health_handler().await;
        assert_eq!(status_code, StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(response.status, "degraded");
        assert_eq!(response.service, "players");
        assert_eq!(
            response.checks.get("db").unwrap(),
            "fail: PLAYERS_DB_URL not set"
        );
        assert_eq!(
            response.checks.get("rabbitmq").unwrap(),
            "fail: RABBITMQ_URL not set"
        );
    }
}
