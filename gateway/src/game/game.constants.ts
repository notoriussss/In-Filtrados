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
