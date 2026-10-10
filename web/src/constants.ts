import type { ErrorCode } from '@in-filtrados/messages';

export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  MATCH_NOT_FOUND: 'MATCH_NOT_FOUND',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  BAD_MESSAGE: 'BAD_MESSAGE',
} as const satisfies Record<string, ErrorCode>;

export const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Usuario o contraseña incorrectos',
  USER_ALREADY_EXISTS: 'Ese usuario ya existe',
  ROOM_NOT_FOUND: 'La sala no existe',
  MATCH_NOT_FOUND: 'La partida no existe',
  SERVICE_UNAVAILABLE: 'El servidor no responde, intenta de nuevo',
  SERVER_ERROR: 'Error del servidor',
} as const;

// Avisos de la conexión con el servidor de juego (S1-20).
export const CONNECTION_MESSAGES = {
  reconnecting: (attempt: number) => `Reconectando… (intento ${attempt})`,
  SESSION_REPLACED: 'Abriste el juego en otra pestaña',
} as const;
