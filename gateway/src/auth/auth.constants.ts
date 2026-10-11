// S2-08: límite de intentos de login por IP (patrón Gateway
// Offloading). Solo aplica a POST /api/auth/login.
export const LOGIN_RATE_LIMIT = {
  TTL_MS: 60_000, // una ventana de un minuto
  MAX_ATTEMPTS: 10, // el undécimo intento responde 429
} as const;

// Mensaje del 429, en español como exige la regla 1 y definido como
// constante dedicada como exige la regla 9 (nunca un string mágico).
export const AUTH_MESSAGES = {
  TOO_MANY_LOGIN_ATTEMPTS:
    'Demasiados intentos de inicio de sesión: espera un minuto',
} as const;
