// User-facing HTTP error messages (in Spanish per Rule 1 and Rule 9).
export const HTTP_MESSAGES = {
  INTERNAL: 'Error interno del servidor',
  SERVICE_UNAVAILABLE: 'El servicio no responde, intenta de nuevo',
  MISSING_TOKEN: 'Falta el token de sesión',
  USERNAME_REQUIRED: 'Falta el usuario',
  PASSWORD_REQUIRED: 'Falta la contraseña',
} as const;

export const AUTH_CONSTANTS = {
  BEARER_PREFIX: 'Bearer ',
} as const;
