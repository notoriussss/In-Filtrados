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
} as const;

// Límites de validación de las acciones del juego (S2-01).
export const MAX_TANK_SLOT = 9; // hasta 10 jugadores por sala
export const MAX_STATION_ID_LENGTH = 64;
// S2-10: votos y chat de la reunión.
export const MAX_PLAYER_ID_LENGTH = 64;
export const MAX_CLIENT_MSG_ID_LENGTH = 64; // un UUID tiene 36
export const MAX_CHAT_LENGTH = 200; // caracteres, igual que match

// S3-02: espera entre intentos de reabrir Play si match no responde.
export const PLAY_RETRY_DELAYS_MS: readonly number[] = [
  500, 1000, 2000, 4000, 8000,
];
export const PLAY_RETRY_MAX_MS = 10_000;

// S3-04: clientMsgId de chat recordados para descartar reintentos.
export const CHAT_IDS_PER_MATCH = 500;
export const CHAT_DEDUPE_MATCHES = 200;

// WebSocket close codes used by the gateway.
export const WS_CLOSE_CODES = {
  NORMAL: 1000,
  SERVICE_UNAVAILABLE: 1011,
  UNAUTHORIZED: 4001,
  REPLACED: 4002,
} as const;
