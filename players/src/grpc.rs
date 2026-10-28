//! Implementación gRPC del servicio `Players` de `proto/players.proto`.
//!
//! Cada método delega en `accounts` y traduce los errores a `tonic::Status`
//! con los códigos y mensajes que acordó el equipo.

use sqlx::PgPool;
use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::accounts::{self, AccountError};
use crate::messages::{
    ERR_MSG_ALREADY_EXISTS, ERR_MSG_INTERNAL, ERR_MSG_INVALID_CREDENTIALS,
    ERR_MSG_INVALID_PASSWORD, ERR_MSG_INVALID_TOKEN, ERR_MSG_INVALID_USERNAME,
    ERR_MSG_ITEM_ALREADY_OWNED, ERR_MSG_ITEM_NOT_FOUND,
    ERR_MSG_NOT_ENOUGH_COINS, ERR_MSG_PLAYER_NOT_FOUND,
};
use crate::progress::{self, ProfileError};
use crate::shop::{self, ShopError, ShopView};

pub mod players_v1 {
    tonic::include_proto!("players.v1");
}

use players_v1::players_server::Players;
use players_v1::{
    BuyItemRequest, LoginRequest, Player, PlayerIdRequest, Profile, Ranking,
    RankingEntry, RankingRequest, RegisterRequest, Shop, ShopItem, Token,
    ValidateRequest,
};

/// Servicio gRPC de cuentas; comparte el pool con el resto del proceso.
pub struct PlayersService {
    pool: PgPool,
}

impl PlayersService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[tonic::async_trait]
impl Players for PlayersService {
    async fn register(
        &self,
        request: Request<RegisterRequest>,
    ) -> Result<Response<Player>, Status> {
        let input = request.into_inner();
        let account =
            accounts::register(&self.pool, &input.username, &input.password)
                .await
                .map_err(status_from)?;

        Ok(Response::new(Player {
            player_id: account.player_id.to_string(),
            username: account.username,
        }))
    }

    async fn login(
        &self,
        request: Request<LoginRequest>,
    ) -> Result<Response<Token>, Status> {
        let input = request.into_inner();
        let session =
            accounts::login(&self.pool, &input.username, &input.password)
                .await
                .map_err(status_from)?;

        Ok(Response::new(Token {
            token: session.token,
            player_id: session.player_id.to_string(),
            username: session.username,
        }))
    }

    async fn validate_token(
        &self,
        request: Request<ValidateRequest>,
    ) -> Result<Response<Player>, Status> {
        let input = request.into_inner();
        let account = accounts::validate_token(&self.pool, &input.token)
            .await
            .map_err(status_from)?;

        Ok(Response::new(Player {
            player_id: account.player_id.to_string(),
            username: account.username,
        }))
    }

    async fn get_profile(
        &self,
        request: Request<PlayerIdRequest>,
    ) -> Result<Response<Profile>, Status> {
        let input = request.into_inner();
        // Un id que no es UUID no puede existir: también es NOT_FOUND.
        let player_id = Uuid::parse_str(&input.player_id)
            .map_err(|_| Status::not_found(ERR_MSG_PLAYER_NOT_FOUND))?;
        let profile = progress::get_profile(&self.pool, player_id)
            .await
            .map_err(status_from_profile)?;

        Ok(Response::new(Profile {
            player_id: profile.player_id.to_string(),
            username: profile.username,
            coins: profile.coins,
            matches_played: profile.matches_played,
            wins: profile.wins,
            times_impostor: profile.times_impostor,
            wins_as_impostor: profile.wins_as_impostor,
        }))
    }

    async fn get_shop(
        &self,
        request: Request<PlayerIdRequest>,
    ) -> Result<Response<Shop>, Status> {
        let player_id = parse_player_id(&request.into_inner().player_id)?;
        let view = shop::get_shop(&self.pool, player_id)
            .await
            .map_err(status_from_shop)?;
        Ok(Response::new(shop_reply(view)))
    }

    async fn buy_item(
        &self,
        request: Request<BuyItemRequest>,
    ) -> Result<Response<Shop>, Status> {
        let input = request.into_inner();
        let player_id = parse_player_id(&input.player_id)?;
        let view = shop::buy_item(&self.pool, player_id, &input.item_id)
            .await
            .map_err(status_from_shop)?;
        Ok(Response::new(shop_reply(view)))
    }

    async fn get_ranking(
        &self,
        request: Request<RankingRequest>,
    ) -> Result<Response<Ranking>, Status> {
        let limit = request.into_inner().limit;
        let rows = progress::get_ranking(&self.pool, limit)
            .await
            .map_err(status_from_profile)?;
        Ok(Response::new(Ranking {
            entries: rows
                .into_iter()
                .map(|row| RankingEntry {
                    player_id: row.player_id.to_string(),
                    username: row.username,
                    matches_played: row.matches_played,
                    wins: row.wins,
                    times_impostor: row.times_impostor,
                    wins_as_impostor: row.wins_as_impostor,
                    harvest: row.harvest,
                    coins_earned: row.coins_earned,
                    liters_saved: row.liters_saved,
                })
                .collect(),
        }))
    }
}

/// Un id que no es UUID no puede existir: también es NOT_FOUND.
fn parse_player_id(raw: &str) -> Result<Uuid, Status> {
    Uuid::parse_str(raw)
        .map_err(|_| Status::not_found(ERR_MSG_PLAYER_NOT_FOUND))
}

fn shop_reply(view: ShopView) -> Shop {
    Shop {
        coins: view.coins,
        items: view
            .entries
            .into_iter()
            .map(|entry| ShopItem {
                id: entry.item.id,
                kind: entry.item.kind.to_string(),
                price: entry.item.price,
                owned: entry.owned,
            })
            .collect(),
    }
}

/// Traduce un error de la tienda al código gRPC que espera el gateway.
fn status_from_shop(error: ShopError) -> Status {
    match error {
        ShopError::PlayerNotFound => {
            Status::not_found(ERR_MSG_PLAYER_NOT_FOUND)
        }
        ShopError::ItemNotFound => Status::not_found(ERR_MSG_ITEM_NOT_FOUND),
        ShopError::AlreadyOwned => {
            Status::already_exists(ERR_MSG_ITEM_ALREADY_OWNED)
        }
        // RESOURCE_EXHAUSTED es el código que el gateway ya manda a 409.
        ShopError::NotEnoughCoins => {
            Status::resource_exhausted(ERR_MSG_NOT_ENOUGH_COINS)
        }
        ShopError::Database(error) => {
            eprintln!("players: error de base de datos: {}", error);
            Status::internal(ERR_MSG_INTERNAL)
        }
    }
}

/// Traduce un error de cuentas al código gRPC que espera el gateway.
fn status_from(error: AccountError) -> Status {
    match error {
        AccountError::InvalidUsername => {
            Status::invalid_argument(ERR_MSG_INVALID_USERNAME)
        }
        AccountError::InvalidPassword => {
            Status::invalid_argument(ERR_MSG_INVALID_PASSWORD)
        }
        AccountError::AlreadyExists => {
            Status::already_exists(ERR_MSG_ALREADY_EXISTS)
        }
        AccountError::InvalidCredentials => {
            Status::unauthenticated(ERR_MSG_INVALID_CREDENTIALS)
        }
        AccountError::InvalidToken => {
            Status::unauthenticated(ERR_MSG_INVALID_TOKEN)
        }
        AccountError::Database(error) => {
            // Nunca se registran contraseñas ni tokens;
            // solo el error del motor.
            eprintln!("players: error de base de datos: {}", error);
            Status::internal(ERR_MSG_INTERNAL)
        }
        AccountError::Internal => Status::internal(ERR_MSG_INTERNAL),
    }
}

/// Traduce un error del perfil al código gRPC que espera el gateway.
fn status_from_profile(error: ProfileError) -> Status {
    match error {
        ProfileError::NotFound => Status::not_found(ERR_MSG_PLAYER_NOT_FOUND),
        ProfileError::Database(error) => {
            eprintln!("players: error de base de datos: {}", error);
            Status::internal(ERR_MSG_INTERNAL)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{DateTime, Duration, Utc};
    use sqlx::postgres::PgPoolOptions;
    use tonic::Code;
    use uuid::Uuid;

    const TEST_PASSWORD: &str = "contrasena-segura";

    static SKIP_NOTICE: std::sync::Once = std::sync::Once::new();

    /// Pool de la base de prueba.
    ///
    /// Se crea uno por test porque cada `#[tokio::test]` tiene su propio
    /// runtime y un pool compartido muere al apagarse el primero.
    /// Sin `TEST_DATABASE_URL` los tests de integración se omiten (el CI no
    /// levanta PostgreSQL); con la variable definida fallan si no conecta.
    async fn test_pool() -> Option<PgPool> {
        let Ok(url) = std::env::var("TEST_DATABASE_URL") else {
            SKIP_NOTICE.call_once(|| {
                eprintln!(
                    "TEST_DATABASE_URL no está definida: \
                     se omiten los tests de integración"
                );
            });
            return None;
        };

        let pool = PgPoolOptions::new()
            .max_connections(2)
            .connect(&url)
            .await
            .expect("no se pudo conectar a TEST_DATABASE_URL");

        // El migrador de sqlx toma un advisory lock, así que varios tests
        // pueden aplicar la migración a la vez sin pisarse.
        sqlx::migrate!()
            .run(&pool)
            .await
            .expect("no se pudieron aplicar las migraciones");

        Some(pool)
    }

    fn unique_username() -> String {
        let suffix = Uuid::new_v4().simple().to_string();
        format!("u_{}", &suffix[..8])
    }

    async fn register_player(
        service: &PlayersService,
        username: &str,
    ) -> Player {
        service
            .register(Request::new(RegisterRequest {
                username: username.to_string(),
                password: TEST_PASSWORD.to_string(),
            }))
            .await
            .expect("el registro debería funcionar")
            .into_inner()
    }

    #[tokio::test]
    async fn register_saves_a_player_with_an_argon2_hash() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let service = PlayersService::new(pool.clone());
        let username = unique_username();

        let response = service
            .register(Request::new(RegisterRequest {
                username: username.clone(),
                password: TEST_PASSWORD.to_string(),
            }))
            .await
            .expect("el registro debería funcionar");

        let player = response.into_inner();
        assert_eq!(player.username, username);
        let player_id = Uuid::parse_str(&player.player_id).unwrap();

        let password_hash: String = sqlx::query_scalar(
            "SELECT password_hash FROM players WHERE id = $1",
        )
        .bind(player_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(password_hash.starts_with("$argon2"));

        let coins: i32 =
            sqlx::query_scalar("SELECT coins FROM players WHERE id = $1")
                .bind(player_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(coins, 0);
    }

    #[tokio::test]
    async fn duplicate_username_is_already_exists() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let service = PlayersService::new(pool);
        let username = unique_username();
        register_player(&service, &username).await;

        let status = service
            .register(Request::new(RegisterRequest {
                username,
                password: TEST_PASSWORD.to_string(),
            }))
            .await
            .unwrap_err();

        assert_eq!(status.code(), Code::AlreadyExists);
        assert_eq!(status.message(), ERR_MSG_ALREADY_EXISTS);
    }

    #[tokio::test]
    async fn invalid_username_and_password_are_invalid_argument() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let service = PlayersService::new(pool);

        let status = service
            .register(Request::new(RegisterRequest {
                username: "ab".to_string(),
                password: TEST_PASSWORD.to_string(),
            }))
            .await
            .unwrap_err();
        assert_eq!(status.code(), Code::InvalidArgument);
        assert_eq!(status.message(), ERR_MSG_INVALID_USERNAME);

        let status = service
            .register(Request::new(RegisterRequest {
                username: unique_username(),
                password: "corta".to_string(),
            }))
            .await
            .unwrap_err();
        assert_eq!(status.code(), Code::InvalidArgument);
        assert_eq!(status.message(), ERR_MSG_INVALID_PASSWORD);
    }

    #[tokio::test]
    async fn login_returns_a_token_valid_for_24_hours() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let service = PlayersService::new(pool.clone());
        let username = unique_username();
        register_player(&service, &username).await;

        let response = service
            .login(Request::new(LoginRequest {
                username,
                password: TEST_PASSWORD.to_string(),
            }))
            .await
            .expect("el login debería funcionar");

        let token = response.into_inner();
        assert_eq!(token.token.len(), accounts::TOKEN_BYTES * 2);
        assert!(token.token.chars().all(|c| c.is_ascii_hexdigit()));

        let expires_at: DateTime<Utc> = sqlx::query_scalar(
            "SELECT expires_at FROM sessions WHERE token = $1",
        )
        .bind(&token.token)
        .fetch_one(&pool)
        .await
        .unwrap();

        let remaining = expires_at - Utc::now();
        assert!(remaining > Duration::hours(23));
        assert!(remaining <= Duration::hours(24));
    }

    #[tokio::test]
    async fn wrong_password_is_unauthenticated() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let service = PlayersService::new(pool);
        let username = unique_username();
        register_player(&service, &username).await;

        let status = service
            .login(Request::new(LoginRequest {
                username,
                password: "contrasena-incorrecta".to_string(),
            }))
            .await
            .unwrap_err();

        assert_eq!(status.code(), Code::Unauthenticated);
        assert_eq!(status.message(), ERR_MSG_INVALID_CREDENTIALS);
    }

    #[tokio::test]
    async fn unknown_user_gets_the_same_message_as_a_wrong_password() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let service = PlayersService::new(pool);

        let status = service
            .login(Request::new(LoginRequest {
                username: unique_username(),
                password: TEST_PASSWORD.to_string(),
            }))
            .await
            .unwrap_err();

        assert_eq!(status.code(), Code::Unauthenticated);
        assert_eq!(status.message(), ERR_MSG_INVALID_CREDENTIALS);
    }

    #[tokio::test]
    async fn validate_token_returns_the_player() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let service = PlayersService::new(pool);
        let username = unique_username();
        register_player(&service, &username).await;

        let login = service
            .login(Request::new(LoginRequest {
                username: username.clone(),
                password: TEST_PASSWORD.to_string(),
            }))
            .await
            .unwrap()
            .into_inner();

        let response = service
            .validate_token(Request::new(ValidateRequest {
                token: login.token,
            }))
            .await
            .expect("el token debería ser válido");

        let player = response.into_inner();
        assert_eq!(player.player_id, login.player_id);
        assert_eq!(player.username, username);
    }

    #[tokio::test]
    async fn expired_token_is_unauthenticated() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let service = PlayersService::new(pool.clone());
        let username = unique_username();
        register_player(&service, &username).await;

        let login = service
            .login(Request::new(LoginRequest {
                username,
                password: TEST_PASSWORD.to_string(),
            }))
            .await
            .unwrap()
            .into_inner();
        let player_id = Uuid::parse_str(&login.player_id).unwrap();

        let expired_token =
            format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        sqlx::query(
            "INSERT INTO sessions (token, player_id, expires_at)
             VALUES ($1, $2, now() - interval '1 hour')",
        )
        .bind(&expired_token)
        .bind(player_id)
        .execute(&pool)
        .await
        .unwrap();

        let status = service
            .validate_token(Request::new(ValidateRequest {
                token: expired_token,
            }))
            .await
            .unwrap_err();

        assert_eq!(status.code(), Code::Unauthenticated);
        assert_eq!(status.message(), ERR_MSG_INVALID_TOKEN);
    }

    #[tokio::test]
    async fn unknown_token_is_unauthenticated() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let service = PlayersService::new(pool);

        let status = service
            .validate_token(Request::new(ValidateRequest {
                token: Uuid::new_v4().simple().to_string(),
            }))
            .await
            .unwrap_err();

        assert_eq!(status.code(), Code::Unauthenticated);
        assert_eq!(status.message(), ERR_MSG_INVALID_TOKEN);
    }

    #[tokio::test]
    async fn new_player_profile_starts_at_zero() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let service = PlayersService::new(pool);
        let username = unique_username();
        let player = register_player(&service, &username).await;

        let profile = service
            .get_profile(Request::new(PlayerIdRequest {
                player_id: player.player_id.clone(),
            }))
            .await
            .expect("el perfil debería existir")
            .into_inner();

        assert_eq!(profile.player_id, player.player_id);
        assert_eq!(profile.username, username);
        assert_eq!(profile.coins, 0);
        assert_eq!(profile.matches_played, 0);
        assert_eq!(profile.wins, 0);
        assert_eq!(profile.times_impostor, 0);
        assert_eq!(profile.wins_as_impostor, 0);
    }

    #[tokio::test]
    async fn unknown_player_profile_is_not_found() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let service = PlayersService::new(pool);

        for player_id in [Uuid::new_v4().to_string(), "no-es-uuid".into()] {
            let status = service
                .get_profile(Request::new(PlayerIdRequest { player_id }))
                .await
                .unwrap_err();

            assert_eq!(status.code(), Code::NotFound);
            assert_eq!(status.message(), ERR_MSG_PLAYER_NOT_FOUND);
        }
    }

    #[tokio::test]
    async fn ranking_orders_by_wins_and_sums_the_results() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let service = PlayersService::new(pool.clone());
        let top = register_player(&service, &unique_username()).await;
        let low = register_player(&service, &unique_username()).await;
        // Tantas victorias que quedan arriba aunque la base ya tenga datos.
        for (player, wins) in [(&top, 2_000_000), (&low, 1_999_999)] {
            sqlx::query(
                "UPDATE players SET wins = $1, matches_played = $1
                 WHERE id = $2",
            )
            .bind(wins)
            .bind(Uuid::parse_str(&player.player_id).unwrap())
            .execute(&pool)
            .await
            .unwrap();
        }
        for _ in 0..2 {
            sqlx::query(
                "INSERT INTO results
                   (match_id, player_id, role, won, harvest, coins_earned,
                    liters_saved)
                 VALUES ($1, $2, 'CREW', TRUE, 30, 50, 300)",
            )
            .bind(Uuid::new_v4())
            .bind(Uuid::parse_str(&top.player_id).unwrap())
            .execute(&pool)
            .await
            .unwrap();
        }

        let ranking = service
            .get_ranking(Request::new(RankingRequest { limit: 0 }))
            .await
            .expect("el ranking debería funcionar")
            .into_inner();

        assert_eq!(ranking.entries[0].player_id, top.player_id);
        assert_eq!(ranking.entries[0].harvest, 60);
        assert_eq!(ranking.entries[0].coins_earned, 100);
        assert_eq!(ranking.entries[0].liters_saved, 600);
        assert_eq!(ranking.entries[1].player_id, low.player_id);
        assert_eq!(ranking.entries[1].harvest, 0);
        assert_eq!(ranking.entries[1].liters_saved, 0);

        let one = service
            .get_ranking(Request::new(RankingRequest { limit: 1 }))
            .await
            .unwrap()
            .into_inner();
        assert_eq!(one.entries.len(), 1);

        // Estos dos no deben quedar arriba del ranking de la base de pruebas.
        for player in [&top, &low] {
            let id = Uuid::parse_str(&player.player_id).unwrap();
            sqlx::query("DELETE FROM results WHERE player_id = $1")
                .bind(id)
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("DELETE FROM sessions WHERE player_id = $1")
                .bind(id)
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("DELETE FROM players WHERE id = $1")
                .bind(id)
                .execute(&pool)
                .await
                .unwrap();
        }
    }

    /// Registra un jugador y le da monedas directo en la base.
    async fn player_with_coins(
        service: &PlayersService,
        pool: &PgPool,
        coins: i32,
    ) -> String {
        let player = register_player(service, &unique_username()).await;
        sqlx::query("UPDATE players SET coins = $1 WHERE id = $2")
            .bind(coins)
            .bind(Uuid::parse_str(&player.player_id).unwrap())
            .execute(pool)
            .await
            .unwrap();
        player.player_id
    }

    async fn buy(
        service: &PlayersService,
        player_id: &str,
        item_id: &str,
    ) -> Result<Shop, Status> {
        service
            .buy_item(Request::new(BuyItemRequest {
                player_id: player_id.to_string(),
                item_id: item_id.to_string(),
            }))
            .await
            .map(Response::into_inner)
    }

    #[tokio::test]
    async fn new_player_owns_nothing() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let service = PlayersService::new(pool.clone());
        let player_id = player_with_coins(&service, &pool, 0).await;

        let shop = service
            .get_shop(Request::new(PlayerIdRequest { player_id }))
            .await
            .unwrap()
            .into_inner();

        assert_eq!(shop.coins, 0);
        assert_eq!(shop.items.len(), 20);
        assert!(shop.items.iter().all(|item| !item.owned));
    }

    #[tokio::test]
    async fn buying_charges_the_coins_and_marks_the_item() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let service = PlayersService::new(pool.clone());
        let player_id = player_with_coins(&service, &pool, 200).await;

        let shop = buy(&service, &player_id, "gota-e6194b").await.unwrap();

        assert_eq!(shop.coins, 200 - shop::GOTA_PRICE);
        let item = shop.items.iter().find(|i| i.id == "gota-e6194b");
        assert!(item.unwrap().owned);
    }

    #[tokio::test]
    async fn buying_without_enough_coins_changes_nothing() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let service = PlayersService::new(pool.clone());
        let player_id = player_with_coins(&service, &pool, 10).await;

        let status = buy(&service, &player_id, "cap").await.unwrap_err();
        assert_eq!(status.code(), Code::ResourceExhausted);
        assert_eq!(status.message(), ERR_MSG_NOT_ENOUGH_COINS);

        let shop = service
            .get_shop(Request::new(PlayerIdRequest { player_id }))
            .await
            .unwrap()
            .into_inner();
        assert_eq!(shop.coins, 10);
        assert!(shop.items.iter().all(|item| !item.owned));
    }

    #[tokio::test]
    async fn buying_twice_is_already_exists_and_charges_once() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let service = PlayersService::new(pool.clone());
        let player_id = player_with_coins(&service, &pool, 500).await;

        buy(&service, &player_id, "helmet").await.unwrap();
        let status = buy(&service, &player_id, "helmet").await.unwrap_err();

        assert_eq!(status.code(), Code::AlreadyExists);
        assert_eq!(status.message(), ERR_MSG_ITEM_ALREADY_OWNED);
        let shop = service
            .get_shop(Request::new(PlayerIdRequest { player_id }))
            .await
            .unwrap()
            .into_inner();
        assert_eq!(shop.coins, 500 - shop::ACCESSORY_PRICE);
    }

    #[tokio::test]
    async fn unknown_item_and_unknown_player_are_not_found() {
        let Some(pool) = test_pool().await else {
            return;
        };
        let service = PlayersService::new(pool.clone());
        let player_id = player_with_coins(&service, &pool, 500).await;

        let status = buy(&service, &player_id, "tiara").await.unwrap_err();
        assert_eq!(status.code(), Code::NotFound);
        assert_eq!(status.message(), ERR_MSG_ITEM_NOT_FOUND);

        let ghost = Uuid::new_v4().to_string();
        let status = buy(&service, &ghost, "cap").await.unwrap_err();
        assert_eq!(status.code(), Code::NotFound);
        assert_eq!(status.message(), ERR_MSG_PLAYER_NOT_FOUND);
    }
}
