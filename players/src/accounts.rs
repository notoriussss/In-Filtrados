//! Registro, login y validación de tokens de los jugadores.
//!
//! Toda la lógica de cuentas vive aquí; `grpc.rs` solo traduce los
//! resultados a mensajes y códigos gRPC.

use argon2::password_hash::{phc::PasswordHash, PasswordHasher, PasswordVerifier};
use argon2::Argon2;
use sqlx::PgPool;
use uuid::Uuid;

/// Longitud mínima y máxima del nombre de usuario.
pub const USERNAME_MIN_LEN: usize = 3;
pub const USERNAME_MAX_LEN: usize = 20;

/// Longitud mínima de la contraseña.
pub const PASSWORD_MIN_LEN: usize = 8;

/// Bytes aleatorios que forman el token de sesión.
pub const TOKEN_BYTES: usize = 32;

/// Horas que dura una sesión antes de vencer.
pub const SESSION_HOURS: i32 = 24;

/// Error de cuentas que `grpc.rs` traduce a un `tonic::Status`.
#[derive(Debug)]
pub enum AccountError {
    InvalidUsername,
    InvalidPassword,
    AlreadyExists,
    InvalidCredentials,
    InvalidToken,
    Database(sqlx::Error),
    Internal,
}

/// Datos públicos de un jugador (nunca incluyen el hash).
#[derive(Debug, Clone)]
pub struct PlayerAccount {
    pub player_id: Uuid,
    pub username: String,
}

/// Sesión creada por `login`.
#[derive(Debug, Clone)]
pub struct AuthSession {
    pub token: String,
    pub player_id: Uuid,
    pub username: String,
}

/// Un usuario válido tiene entre 3 y 20 caracteres: letras, números y `_`.
pub fn is_valid_username(username: &str) -> bool {
    let length = username.chars().count();
    (USERNAME_MIN_LEN..=USERNAME_MAX_LEN).contains(&length)
        && username
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// Una contraseña válida tiene al menos 8 caracteres.
pub fn is_valid_password(password: &str) -> bool {
    password.chars().count() >= PASSWORD_MIN_LEN
}

/// Registra un jugador nuevo con la contraseña hasheada con Argon2.
///
/// Si el usuario ya existe devuelve `AccountError::AlreadyExists` sin
/// revelar ningún dato del jugador anterior.
pub async fn register(
    pool: &PgPool,
    username: &str,
    password: &str,
) -> Result<PlayerAccount, AccountError> {
    if !is_valid_username(username) {
        return Err(AccountError::InvalidUsername);
    }
    if !is_valid_password(password) {
        return Err(AccountError::InvalidPassword);
    }

    let password_hash = Argon2::default()
        .hash_password(password.as_bytes())
        .map_err(|_| AccountError::Internal)?
        .to_string();

    let player_id = Uuid::new_v4();
    let insert = sqlx::query(
        "INSERT INTO players (id, username, password_hash)
         VALUES ($1, $2, $3)",
    )
    .bind(player_id)
    .bind(username)
    .bind(&password_hash)
    .execute(pool)
    .await;

    match insert {
        Ok(_) => Ok(PlayerAccount {
            player_id,
            username: username.to_string(),
        }),
        // La restricción UNIQUE decide; así dos registros a la vez no
        // pasan ambos aunque hagan SELECT antes de INSERT.
        Err(sqlx::Error::Database(error)) if error.is_unique_violation() => {
            Err(AccountError::AlreadyExists)
        }
        Err(error) => Err(AccountError::Database(error)),
    }
}

/// Verifica las credenciales y, si son correctas, crea una sesión.
///
/// Usuario inexistente y contraseña incorrecta devuelven el mismo error
/// (`InvalidCredentials`) para no revelar cuál de los dos falló.
pub async fn login(
    pool: &PgPool,
    username: &str,
    password: &str,
) -> Result<AuthSession, AccountError> {
    let row = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT id, password_hash FROM players WHERE username = $1",
    )
    .bind(username)
    .fetch_optional(pool)
    .await
    .map_err(AccountError::Database)?;

    let Some((player_id, stored_hash)) = row else {
        return Err(AccountError::InvalidCredentials);
    };

    verify_password(password, &stored_hash)?;

    let token = generate_token()?;
    sqlx::query(
        "INSERT INTO sessions (token, player_id, expires_at)
         VALUES ($1, $2, now() + make_interval(hours => $3))",
    )
    .bind(&token)
    .bind(player_id)
    .bind(SESSION_HOURS)
    .execute(pool)
    .await
    .map_err(AccountError::Database)?;

    Ok(AuthSession {
        token,
        player_id,
        username: username.to_string(),
    })
}

/// Busca un token que no haya vencido y devuelve su jugador.
pub async fn validate_token(pool: &PgPool, token: &str) -> Result<PlayerAccount, AccountError> {
    let row = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT p.id, p.username
         FROM sessions s
         JOIN players p ON p.id = s.player_id
         WHERE s.token = $1 AND s.expires_at > now()",
    )
    .bind(token)
    .fetch_optional(pool)
    .await
    .map_err(AccountError::Database)?;

    row.map(|(player_id, username)| PlayerAccount {
        player_id,
        username,
    })
    .ok_or(AccountError::InvalidToken)
}

/// Compara la contraseña con el hash guardado.
fn verify_password(password: &str, stored_hash: &str) -> Result<(), AccountError> {
    let parsed_hash =
        PasswordHash::new(stored_hash).map_err(|_| AccountError::InvalidCredentials)?;

    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .map_err(|_| AccountError::InvalidCredentials)
}

/// Genera un token nuevo: 32 bytes del sistema en hexadecimal.
fn generate_token() -> Result<String, AccountError> {
    let mut bytes = [0u8; TOKEN_BYTES];
    getrandom::fill(&mut bytes).map_err(|_| AccountError::Internal)?;

    Ok(hex::encode(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn username_needs_between_3_and_20_characters() {
        assert!(!is_valid_username("ab"));
        assert!(is_valid_username("abc"));
        assert!(is_valid_username(&"a".repeat(USERNAME_MAX_LEN)));
        assert!(!is_valid_username(&"a".repeat(USERNAME_MAX_LEN + 1)));
    }

    #[test]
    fn username_only_accepts_letters_numbers_and_underscore() {
        assert!(is_valid_username("jugador_1"));
        assert!(!is_valid_username("jugador-1"));
        assert!(!is_valid_username("jugador 1"));
        assert!(!is_valid_username("jugadorá"));
    }

    #[test]
    fn password_needs_at_least_8_characters() {
        assert!(!is_valid_password("1234567"));
        assert!(is_valid_password("12345678"));
        assert!(is_valid_password("contraseña"));
    }
}
