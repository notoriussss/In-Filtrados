//! Progreso del jugador: monedas, partidas jugadas y victorias.
//!
//! `consumer.rs` suma el progreso al terminar cada partida; este módulo
//! solo lo lee para `GetProfile`.

use sqlx::PgPool;
use uuid::Uuid;

/// Error al leer el perfil; `grpc.rs` lo traduce a un `tonic::Status`.
#[derive(Debug)]
pub enum ProfileError {
    NotFound,
    Database(sqlx::Error),
}

/// Perfil público de un jugador (nunca incluye el hash).
#[derive(Debug, Clone)]
pub struct PlayerProfile {
    pub player_id: Uuid,
    pub username: String,
    pub coins: i32,
    pub matches_played: i32,
    pub wins: i32,
}

/// Busca el perfil de un jugador por su id.
pub async fn get_profile(
    pool: &PgPool,
    player_id: Uuid,
) -> Result<PlayerProfile, ProfileError> {
    let row = sqlx::query_as::<_, (String, i32, i32, i32)>(
        "SELECT username, coins, matches_played, wins
         FROM players
         WHERE id = $1",
    )
    .bind(player_id)
    .fetch_optional(pool)
    .await
    .map_err(ProfileError::Database)?;

    let (username, coins, matches_played, wins) =
        row.ok_or(ProfileError::NotFound)?;

    Ok(PlayerProfile {
        player_id,
        username,
        coins,
        matches_played,
        wins,
    })
}
