mod health;

use axum::{routing::get, Router};
use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    let app = Router::new().route("/health", get(health::health_handler));

    let port: u16 = std::env::var("HTTP_PORT")
        .unwrap_or_else(|_| "8082".to_string())
        .parse()
        .unwrap_or(8082);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("Players HTTP service listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
