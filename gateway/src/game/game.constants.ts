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

// WebSocket close codes used by the gateway.
export const WS_CLOSE_CODES = {
  NORMAL: 1000,
  SERVICE_UNAVAILABLE: 1011,
  UNAUTHORIZED: 4001,
  REPLACED: 4002,
} as const;

export const WS_CLOSE_REPLACED = WS_CLOSE_CODES.REPLACED;
