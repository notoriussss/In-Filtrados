//! Constantes de los mensajes que `players` devuelve al cliente.
//!
//! Regla del repo: ningún mensaje de error se escribe directamente en el
//! código; todos viven aquí y están en español porque los ve el jugador.

pub const ERR_MSG_INVALID_USERNAME: &str =
    "El usuario debe tener entre 3 y 20 caracteres: letras, números y _";
pub const ERR_MSG_INVALID_PASSWORD: &str =
    "La contraseña debe tener al menos 8 caracteres";
pub const ERR_MSG_ALREADY_EXISTS: &str = "Ese usuario ya está registrado";
pub const ERR_MSG_INVALID_CREDENTIALS: &str =
    "Usuario o contraseña incorrectos";
pub const ERR_MSG_INVALID_TOKEN: &str = "Token inválido o vencido";
pub const ERR_MSG_INTERNAL: &str = "Error interno del servidor";
pub const ERR_MSG_PLAYER_NOT_FOUND: &str = "El jugador no existe";
pub const ERR_MSG_ITEM_NOT_FOUND: &str = "Ese artículo no existe";
pub const ERR_MSG_ITEM_ALREADY_OWNED: &str = "Ya tienes este artículo";
pub const ERR_MSG_NOT_ENOUGH_COINS: &str = "No te alcanzan las monedas";
