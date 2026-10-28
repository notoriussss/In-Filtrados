//! Progreso del jugador: monedas, partidas jugadas, victorias y sus
//! estadísticas como impostor (S2-07).
//!
//! `consumer.rs` suma el progreso al terminar cada partida; este módulo
//! solo lo lee para `GetProfile` y `GetRanking`.

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
    pub times_impostor: i32,
    pub wins_as_impostor: i32,
}

/// Busca el perfil de un jugador por su id.
pub async fn get_profile(
    pool: &PgPool,
    player_id: Uuid,
) -> Result<PlayerProfile, ProfileError> {
    let row = sqlx::query_as::<_, (String, i32, i32, i32, i32, i32)>(
        "SELECT username, coins, matches_played, wins,
                times_impostor, wins_as_impostor
         FROM players
         WHERE id = $1",
    )
    .bind(player_id)
    .fetch_optional(pool)
    .await
    .map_err(ProfileError::Database)?;

    let (
        username,
        coins,
        matches_played,
        wins,
        times_impostor,
        wins_as_impostor,
    ) = row.ok_or(ProfileError::NotFound)?;

    Ok(PlayerProfile {
        player_id,
        username,
        coins,
        matches_played,
        wins,
        times_impostor,
        wins_as_impostor,
    })
}

/// Cuántos jugadores devuelve el ranking como máximo.
pub const MAX_RANKING: i32 = 100;

/// Un jugador del ranking con todas sus estadísticas.
#[derive(Debug, Clone)]
pub struct RankingRow {
    pub player_id: Uuid,
    pub username: String,
    pub matches_played: i32,
    pub wins: i32,
    pub times_impostor: i32,
    pub wins_as_impostor: i32,
    pub harvest: i32,
    pub coins_earned: i32,
}

/// `limit` pedido por el cliente: 0, negativo o pasado del máximo es el
/// máximo.
pub fn ranking_limit(requested: i32) -> i32 {
    if requested <= 0 || requested > MAX_RANKING {
        MAX_RANKING
    } else {
        requested
    }
}

/// Todos los jugadores, de más a menos victorias; a igualdad gana quien
/// necesitó menos partidas y luego el nombre. La cosecha y las monedas
/// ganadas salen de `results`, así que no bajan al gastar en la tienda.
pub async fn get_ranking(
    pool: &PgPool,
    limit: i32,
) -> Result<Vec<RankingRow>, ProfileError> {
    let rows =
        sqlx::query_as::<_, (Uuid, String, i32, i32, i32, i32, i32, i32)>(
            "SELECT p.id, p.username, p.matches_played, p.wins,
                p.times_impostor, p.wins_as_impostor,
                COALESCE(SUM(r.harvest), 0)::INT4,
                COALESCE(SUM(r.coins_earned), 0)::INT4
         FROM players p
         LEFT JOIN results r ON r.player_id = p.id
         GROUP BY p.id
         ORDER BY p.wins DESC, p.matches_played ASC, p.username ASC
         LIMIT $1",
        )
        .bind(i64::from(ranking_limit(limit)))
        .fetch_all(pool)
        .await
        .map_err(ProfileError::Database)?;

    Ok(rows
        .into_iter()
        .map(
            |(
                player_id,
                username,
                matches_played,
                wins,
                times_impostor,
                wins_as_impostor,
                harvest,
                coins_earned,
            )| RankingRow {
                player_id,
                username,
                matches_played,
                wins,
                times_impostor,
                wins_as_impostor,
                harvest,
                coins_earned,
            },
        )
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranking_limit_falls_back_to_the_maximum() {
        assert_eq!(ranking_limit(0), MAX_RANKING);
        assert_eq!(ranking_limit(-5), MAX_RANKING);
        assert_eq!(ranking_limit(1000), MAX_RANKING);
        assert_eq!(ranking_limit(10), 10);
        assert_eq!(ranking_limit(MAX_RANKING), MAX_RANKING);
    }
}
