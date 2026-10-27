import type { ErrorCode } from '@in-filtrados/messages';

// Error codes returned to the client in WebSocket ServerMessage error events.
export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  BAD_MESSAGE: 'BAD_MESSAGE',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const satisfies Record<string, ErrorCode>;

// User-facing error messages (always in Spanish per project guidelines).
export const ERROR_MESSAGES = {
  MISSING_TOKEN: 'Falta el token de sesión',
  INVALID_TOKEN: 'Sesión inválida o expirada',
  PLAYERS_SERVICE_UNAVAILABLE: 'El servidor de cuentas no responde',
  MATCH_SERVICE_UNAVAILABLE: 'El servidor de la partida no responde',
  MALFORMED_MESSAGE: 'Mensaje inválido o malformado',
  // S2-08: aviso enviado antes de cerrar la conexión por exceso de
  // mensajes. Se envía dentro de un error BAD_MESSAGE para no tocar el
  // contrato de messages/src/index.ts.
  RATE_LIMITED: 'Vas muy rápido: el gateway está descartando tus mensajes',
} as const;

// S2-08: límite de velocidad por WebSocket (patrón Gateway
// Offloading). El token bucket arranca lleno y se recarga de a uno
// por segundo trabajado.
export const RATE_LIMIT_PER_SECOND = 30;
export const RATE_LIMIT_CAPACITY = 30;
export const RATE_LIMIT_WARNINGS = 3;
// Si pasa este tiempo sin descartar nada, los avisos se olvidan: tres
// ráfagas aisladas en una partida no desconectan a nadie.
export const RATE_LIMIT_WARNING_RESET_MS = 1000;

// Límites de validación de las acciones del juego (S2-01).
export const MAX_TANK_SLOT = 9; // hasta 10 jugadores por sala
export const MAX_STATION_ID_LENGTH = 64;
// S2-10: votos y chat de la reunión.
export const MAX_PLAYER_ID_LENGTH = 64;
export const MAX_CLIENT_MSG_ID_LENGTH = 64; // un UUID tiene 36
export const MAX_CHAT_LENGTH = 200; // caracteres, igual que match
// S3-05: sabotajes y puntos de reparación.
export const EMERGENCY_KINDS: readonly unknown[] = ['pipe', 'steam'];
export const MAX_FIX_POINT_ID_LENGTH = 64;
// Elegir color en la sala: un color CSS como "#4363d8".
export const MAX_COLOR_LENGTH = 16;
// Elegir accesorio en la sala: id como "straw-hat", "headphones".
export const MAX_ACCESSORY_LENGTH = 32;

// S3-02: espera entre intentos de reabrir Play si match no responde.
export const PLAY_RETRY_DELAYS_MS: readonly number[] = [
  500, 1000, 2000, 4000, 8000,
];
export const PLAY_RETRY_MAX_MS = 10_000;

// S3-04: clientMsgId de chat recordados para descartar reintentos en vuelo.
export const CHAT_IDS_PER_MATCH = 500;
export const CHAT_DEDUPE_MATCHES = 200;
export const CHAT_IN_FLIGHT_MS = 3000;

// Heartbeat (deployment-lab.md, 9.1): el navegador manda ping cada 2 s;
// si pasan 5 s sin ningún mensaje, el gateway corta el WebSocket.
export const HEARTBEAT_TIMEOUT_MS = 5_000;
export const HEARTBEAT_CHECK_MS = 1_000;

// WebSocket close codes used by the gateway.
export const WS_CLOSE_CODES = {
  NORMAL: 1000,
  SERVICE_UNAVAILABLE: 1011,
  UNAUTHORIZED: 4001,
  REPLACED: 4002,
  RATE_LIMITED: 4008, // S2-08: 3 avisos de límite de velocidad
} as const;
