// User-facing HTTP error messages (in Spanish per Rule 1 and Rule 9).
export const HTTP_MESSAGES = {
  INTERNAL: 'Error interno del servidor',
  SERVICE_UNAVAILABLE: 'El servicio no responde, intenta de nuevo',
  MISSING_TOKEN: 'Falta el token de sesión',
  USERNAME_REQUIRED: 'Falta el usuario',
  PASSWORD_REQUIRED: 'Falta la contraseña',
  ITEM_REQUIRED: 'Falta el artículo',
} as const;

export const SWAGGER = {
  TITLE: 'In-Filtrados Gateway',
  DESCRIPTION: 'API HTTP del gateway de In-Filtrados',
  VERSION: '1.0',
  PATH: 'docs',
  TAG_AUTH: 'auth',
  TAG_ROOMS: 'rooms',
  TAG_SHOP: 'shop',
  TAG_HEALTH: 'health',
} as const;

export const AUTH_CONSTANTS = {
  BEARER_PREFIX: 'Bearer ',
} as const;
