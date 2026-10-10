//! Arranque del servicio `players`: migraciones, gRPC y `/health`.

// Tonic genera métodos con `Result<_, tonic::Status>` (un error grande);
// no es una API que podamos cambiar desde aquí.
#![allow(clippy::result_large_err)]

mod accounts;
mod consumer;
mod grpc;
mod health;
mod messages;
mod progress;

use axum::{routing::get, Router};
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use tonic::transport::Server;

use grpc::players_v1::players_server::PlayersServer;
use grpc::PlayersService;

const HTTP_PORT_DEFAULT: u16 = 8082;
const GRPC_PORT_DEFAULT: u16 = 50052;
const DB_MAX_CONNECTIONS: u32 = 5;

#[tokio::main]
async fn main() {
    let db_url = std::env::var("PLAYERS_DB_URL")
        .expect("falta la variable de entorno PLAYERS_DB_URL");

    let pool = PgPoolOptions::new()
        .max_connections(DB_MAX_CONNECTIONS)
        .connect(&db_url)
        .await
        .expect("no se pudo conectar a players-db");

    sqlx::migrate!()
        .run(&pool)
        .await
        .expect("no se pudieron aplicar las migraciones");

    // S1-14: el consumidor corre aparte y nunca tumba el servicio.
    match std::env::var("RABBITMQ_URL") {
        Ok(url) => {
            tokio::spawn(consumer::run(pool.clone(), url));
        }
        Err(_) => {
            eprintln!("players: falta RABBITMQ_URL; no se consumirán eventos");
        }
    }

    let http_port = read_port("HTTP_PORT", HTTP_PORT_DEFAULT);
    let grpc_port = read_port("GRPC_PORT", GRPC_PORT_DEFAULT);

    let grpc_addr = SocketAddr::from(([0, 0, 0, 0], grpc_port));
    println!("Players gRPC service listening on {}", grpc_addr);
    let grpc_server = Server::builder()
        .add_service(PlayersServer::new(PlayersService::new(pool)))
        .serve_with_shutdown(grpc_addr, shutdown_signal());

    let app = Router::new().route("/health", get(health::health_handler));
    let http_addr = SocketAddr::from(([0, 0, 0, 0], http_port));
    println!("Players HTTP service listening on {}", http_addr);
    let listener = tokio::net::TcpListener::bind(http_addr)
        .await
        .expect("no se pudo abrir el puerto HTTP");
    let http_server =
        axum::serve(listener, app).with_graceful_shutdown(shutdown_signal());

    tokio::select! {
        result = grpc_server => {
            if let Err(error) = result {
                eprintln!("players: error en el servidor gRPC: {}", error);
            }
        }
        result = http_server => {
            if let Err(error) = result {
                eprintln!("players: error en el servidor HTTP: {}", error);
            }
        }
    }
}

/// Lee un puerto de una variable de entorno con valor por defecto.
fn read_port(name: &str, default: u16) -> u16 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

/// Espera a Ctrl-C o a SIGTERM (el que manda `docker compose stop`).
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("no se pudo escuchar Ctrl-C");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(
            tokio::signal::unix::SignalKind::terminate(),
        )
        .expect("no se pudo escuchar SIGTERM")
        .recv()
        .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {}
        _ = terminate => {}
    }
}
