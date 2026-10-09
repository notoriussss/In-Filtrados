//! Implementación gRPC del servicio `Players` de `proto/players.proto`.
//!
//! Cada método delega en `accounts` y traduce los errores a `tonic::Status`
//! con los códigos y mensajes que acordó el equipo.

use sqlx::PgPool;
use tonic::{Request, Response, Status};

use crate::accounts::{self, AccountError};
use crate::messages::{
    ERR_MSG_ALREADY_EXISTS, ERR_MSG_INTERNAL, ERR_MSG_INVALID_CREDENTIALS,
    ERR_MSG_INVALID_PASSWORD, ERR_MSG_INVALID_TOKEN, ERR_MSG_INVALID_USERNAME,
    ERR_MSG_NOT_IMPLEMENTED,
};

pub mod players_v1 {
    tonic::include_proto!("players.v1");
}

use players_v1::players_server::Players;
use players_v1::{
    LoginRequest, Player, PlayerIdRequest, Profile, RegisterRequest, Token, ValidateRequest,
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
        let account = accounts::register(&self.pool, &input.username, &input.password)
            .await
            .map_err(status_from)?;

        Ok(Response::new(Player {
            player_id: account.player_id.to_string(),
            username: account.username,
        }))
    }

    async fn login(&self, request: Request<LoginRequest>) -> Result<Response<Token>, Status> {
        let input = request.into_inner();
        let session = accounts::login(&self.pool, &input.username, &input.password)
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

    /// S1-13 implementa el perfil; por ahora solo avisa que no existe.
    async fn get_profile(
        &self,
        _request: Request<PlayerIdRequest>,
    ) -> Result<Response<Profile>, Status> {
        Err(Status::unimplemented(ERR_MSG_NOT_IMPLEMENTED))
    }
}

/// Traduce un error de cuentas al código gRPC que espera el gateway.
fn status_from(error: AccountError) -> Status {
    match error {
        AccountError::InvalidUsername => Status::invalid_argument(ERR_MSG_INVALID_USERNAME),
        AccountError::InvalidPassword => Status::invalid_argument(ERR_MSG_INVALID_PASSWORD),
        AccountError::AlreadyExists => Status::already_exists(ERR_MSG_ALREADY_EXISTS),
        AccountError::InvalidCredentials => Status::unauthenticated(ERR_MSG_INVALID_CREDENTIALS),
        AccountError::InvalidToken => Status::unauthenticated(ERR_MSG_INVALID_TOKEN),
        AccountError::Database(error) => {
            // Nunca se registran contraseñas ni tokens; solo el error del motor.
            eprintln!("players: error de base de datos: {}", error);
            Status::internal(ERR_MSG_INTERNAL)
        }
        AccountError::Internal => Status::internal(ERR_MSG_INTERNAL),
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

    async fn register_player(service: &PlayersService, username: &str) {
        service
            .register(Request::new(RegisterRequest {
                username: username.to_string(),
                password: TEST_PASSWORD.to_string(),
            }))
            .await
            .expect("el registro debería funcionar");
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

        let password_hash: String =
            sqlx::query_scalar("SELECT password_hash FROM players WHERE id = $1")
                .bind(player_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(password_hash.starts_with("$argon2"));

        let coins: i32 = sqlx::query_scalar("SELECT coins FROM players WHERE id = $1")
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

        let expires_at: DateTime<Utc> =
            sqlx::query_scalar("SELECT expires_at FROM sessions WHERE token = $1")
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
            .validate_token(Request::new(ValidateRequest { token: login.token }))
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

        let expired_token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
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
}
