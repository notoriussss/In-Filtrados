//! Consumidor idempotente de `match.finished` (S1-14).
//!
//! Escucha la cola `players.match-finished` y, por cada partida terminada,
//! guarda el resultado de cada jugador y le suma monedas, partidas y
//! victorias. Si el mismo evento llega dos veces, la llave
//! `(match_id, player_id)` de `results` hace que la segunda no sume nada.

use futures_lite::StreamExt;
use lapin::{
    options::{
        BasicAckOptions, BasicConsumeOptions, BasicNackOptions,
        BasicQosOptions, ExchangeDeclareOptions, QueueBindOptions,
        QueueDeclareOptions,
    },
    types::FieldTable,
    Connection, ConnectionProperties, ExchangeKind,
};
use serde::Deserialize;
use sqlx::PgPool;
use std::time::Duration;
use uuid::Uuid;

/// Nombres de `docs/tasks.md` 0.7.
pub const EXCHANGE: &str = "game.events";
pub const QUEUE: &str = "players.match-finished";
pub const ROUTING_KEY: &str = "match.finished";
const CONSUMER_TAG: &str = "players";

/// Mensajes sin confirmar que RabbitMQ entrega a la vez.
const PREFETCH: u16 = 10;

/// Espera entre intentos de conexión a RabbitMQ.
const RECONNECT_DELAY: Duration = Duration::from_secs(2);

/// Monedas extra para cada jugador del equipo ganador.
pub const WIN_BONUS: i32 = 20;

/// Evento `match.finished` (sección 0.7).
#[derive(Debug, Deserialize)]
pub struct MatchFinished {
    pub event_id: Uuid,
    pub match_id: Uuid,
    pub winner: String,
    pub players: Vec<PlayerResult>,
}

/// Resultado de un jugador dentro de `match.finished`.
#[derive(Debug, Deserialize)]
pub struct PlayerResult {
    pub player_id: Uuid,
    pub role: String,
    pub harvest: i32,
}

/// Qué hacer con el mensaje después de procesarlo.
#[derive(Debug, PartialEq, Eq)]
pub enum Outcome {
    /// Se guardó (o ya estaba guardado): `ack`.
    Ack,
    /// El JSON no sirve y reintentarlo no lo arregla: `nack` sin reencolar.
    Discard,
    /// Falló la base de datos: `nack` y reencolar para reintentar.
    Retry,
}

/// Monedas que gana un jugador: su cosecha más el bono si ganó.
pub fn coins_for(harvest: i32, won: bool) -> i32 {
    if won {
        harvest + WIN_BONUS
    } else {
        harvest
    }
}

/// Procesa el cuerpo de un mensaje y dice qué hacer con él.
pub async fn handle_message(pool: &PgPool, body: &[u8]) -> Outcome {
    let event: MatchFinished = match serde_json::from_slice(body) {
        Ok(event) => event,
        Err(error) => {
            eprintln!("players: match.finished mal formado: {}", error);
            return Outcome::Discard;
        }
    };

    match save_results(pool, &event).await {
        Ok(()) => Outcome::Ack,
        Err(error) => {
            eprintln!(
                "players: no se pudo guardar la partida {} (evento {}): {}",
                event.match_id, event.event_id, error
            );
            Outcome::Retry
        }
    }
}

/// Guarda todos los jugadores del evento en una sola transacción.
pub async fn save_results(
    pool: &PgPool,
    event: &MatchFinished,
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;

    for player in &event.players {
        let exists: Option<(Uuid,)> =
            sqlx::query_as("SELECT id FROM players WHERE id = $1")
                .bind(player.player_id)
                .fetch_optional(&mut *tx)
                .await?;
        if exists.is_none() {
            eprintln!(
                "players: aviso: el jugador {} de la partida {} no existe; \
                 se ignora",
                player.player_id, event.match_id
            );
            continue;
        }

        let won = player.role == event.winner;
        let coins = coins_for(player.harvest, won);

        let inserted = sqlx::query(
            "INSERT INTO results
               (match_id, player_id, role, won, harvest, coins_earned)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (match_id, player_id) DO NOTHING",
        )
        .bind(event.match_id)
        .bind(player.player_id)
        .bind(&player.role)
        .bind(won)
        .bind(player.harvest)
        .bind(coins)
        .execute(&mut *tx)
        .await?
        .rows_affected();

        // Si la fila ya existía, este evento es un duplicado: no se suma.
        if inserted == 1 {
            sqlx::query(
                "UPDATE players
                 SET coins = coins + $1,
                     matches_played = matches_played + 1,
                     wins = wins + $2
                 WHERE id = $3",
            )
            .bind(coins)
            .bind(i32::from(won))
            .bind(player.player_id)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await
}

/// Consume para siempre. Si RabbitMQ se cae, reintenta cada 2 segundos
/// sin tumbar el servicio.
pub async fn run(pool: PgPool, rabbitmq_url: String) {
    loop {
        if let Err(error) = consume(&pool, &rabbitmq_url).await {
            eprintln!(
                "players: consumidor de RabbitMQ detenido ({}); \
                 reintento en {}s",
                error,
                RECONNECT_DELAY.as_secs()
            );
        }
        tokio::time::sleep(RECONNECT_DELAY).await;
    }
}

/// Una conexión completa: declara la cola y procesa mensajes hasta que
/// la conexión se cierre.
async fn consume(pool: &PgPool, url: &str) -> Result<(), lapin::Error> {
    let connection =
        Connection::connect(url, ConnectionProperties::default()).await?;
    let channel = connection.create_channel().await?;

    channel
        .exchange_declare(
            EXCHANGE.into(),
            ExchangeKind::Topic,
            ExchangeDeclareOptions {
                durable: true,
                ..ExchangeDeclareOptions::default()
            },
            FieldTable::default(),
        )
        .await?;
    channel
        .queue_declare(
            QUEUE.into(),
            QueueDeclareOptions {
                durable: true,
                ..QueueDeclareOptions::default()
            },
            FieldTable::default(),
        )
        .await?;
    channel
        .queue_bind(
            QUEUE.into(),
            EXCHANGE.into(),
            ROUTING_KEY.into(),
            QueueBindOptions::default(),
            FieldTable::default(),
        )
        .await?;
    channel
        .basic_qos(PREFETCH, BasicQosOptions::default())
        .await?;

    let mut consumer = channel
        .basic_consume(
            QUEUE.into(),
            CONSUMER_TAG.into(),
            BasicConsumeOptions::default(),
            FieldTable::default(),
        )
        .await?;
    println!("players: escuchando {} en RabbitMQ", QUEUE);

    while let Some(delivery) = consumer.next().await {
        let delivery = delivery?;
        // El ack va después del COMMIT de handle_message.
        match handle_message(pool, &delivery.data).await {
            Outcome::Ack => {
                delivery.ack(BasicAckOptions::default()).await?;
            }
            Outcome::Discard => {
                delivery
                    .nack(BasicNackOptions {
                        requeue: false,
                        ..BasicNackOptions::default()
                    })
                    .await?;
            }
            Outcome::Retry => {
                // Una pausa corta para no girar en vacío si la base cayó.
                tokio::time::sleep(RECONNECT_DELAY).await;
                delivery
                    .nack(BasicNackOptions {
                        requeue: true,
                        ..BasicNackOptions::default()
                    })
                    .await?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::postgres::PgPoolOptions;

    /// Igual que en `grpc.rs`: sin `TEST_DATABASE_URL` se omiten.
    async fn test_pool() -> Option<PgPool> {
        let url = std::env::var("TEST_DATABASE_URL").ok()?;
        let pool = PgPoolOptions::new()
            .max_connections(2)
            .connect(&url)
            .await
            .expect("no se pudo conectar a TEST_DATABASE_URL");
        sqlx::migrate!()
            .run(&pool)
            .await
            .expect("no se pudieron aplicar las migraciones");
        Some(pool)
    }

    /// Crea un jugador directo en la base y devuelve su id.
    async fn new_player(pool: &PgPool) -> Uuid {
        let id = Uuid::new_v4();
        let username = format!("c_{}", &id.simple().to_string()[..8]);
        sqlx::query(
            "INSERT INTO players (id, username, password_hash)
             VALUES ($1, $2, 'x')",
        )
        .bind(id)
        .bind(username)
        .execute(pool)
        .await
        .expect("insert player");
        id
    }

    async fn stats(pool: &PgPool, id: Uuid) -> (i32, i32, i32) {
        sqlx::query_as(
            "SELECT coins, matches_played, wins FROM players WHERE id = $1",
        )
        .bind(id)
        .fetch_one(pool)
        .await
        .expect("select stats")
    }

    fn event_json(match_id: Uuid, players: &[(Uuid, &str, i32)]) -> String {
        let players: Vec<String> = players
            .iter()
            .map(|(id, role, harvest)| {
                format!(
                    r#"{{"player_id":"{id}","role":"{role}",
                        "ejected":false,"harvest":{harvest}}}"#
                )
            })
            .collect();
        format!(
            r#"{{"event_id":"{}","match_id":"{match_id}",
                "finished_at":"2026-10-10T00:00:00Z","winner":"crew",
                "players":[{}]}}"#,
            Uuid::new_v4(),
            players.join(",")
        )
    }

    #[test]
    fn winners_get_the_bonus() {
        assert_eq!(coins_for(5, true), 5 + WIN_BONUS);
        assert_eq!(coins_for(5, false), 5);
    }

    #[tokio::test]
    async fn malformed_json_is_discarded() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let outcome = handle_message(&pool, b"{ no es json").await;
        assert_eq!(outcome, Outcome::Discard);
    }

    #[tokio::test]
    async fn the_same_event_twice_counts_once() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let crew = new_player(&pool).await;
        let impostor = new_player(&pool).await;
        let body = event_json(
            Uuid::new_v4(),
            &[(crew, "crew", 7), (impostor, "impostor", 3)],
        );

        // El mismo mensaje dos veces, como en una reentrega de RabbitMQ.
        for _ in 0..2 {
            let outcome = handle_message(&pool, body.as_bytes()).await;
            assert_eq!(outcome, Outcome::Ack);
        }

        assert_eq!(stats(&pool, crew).await, (7 + WIN_BONUS, 1, 1));
        assert_eq!(stats(&pool, impostor).await, (3, 1, 0));
    }

    #[tokio::test]
    async fn unknown_player_is_skipped() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let known = new_player(&pool).await;
        let body = event_json(
            Uuid::new_v4(),
            &[(Uuid::new_v4(), "crew", 0), (known, "crew", 0)],
        );

        let outcome = handle_message(&pool, body.as_bytes()).await;

        assert_eq!(outcome, Outcome::Ack);
        assert_eq!(stats(&pool, known).await, (WIN_BONUS, 1, 1));
    }
}
