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
  // S3-02: la sala espera a alguien o match no responde.
  pausedFor: (names: string) => `Partida en pausa: esperando a ${names}`,
  PAUSED: 'Partida en pausa',
  MATCH_DOWN:
    'Partida en pausa: reconectando con el servidor de la partida…',
} as const;

// Textos de la reunión, la votación y el fin de partida (S2-10).
export const MEETING_TEXT = {
  TITLE: 'Reunión de emergencia',
  REPORTED_BY: (name: string) => `${name} reportó un tanque muerto`,
  TANK_OF: (name: string) => `Tanque de ${name}`,
  LAST_VISITORS: 'Últimos en pasar por el tanque',
  NO_VISITORS: 'Nadie pasó cerca',
  VOTING_ENDS_IN: (seconds: number) => `Votación: ${seconds} s`,
  RESULT_ENDS_IN: (seconds: number) => `Volvemos al huerto en ${seconds} s`,
  PLAYERS: 'Jugadores',
  VOTED: 'votó',
  GHOST: 'fantasma',
  DISCONNECTED: 'desconectado',
  YOU: 'tú',
  SKIP: 'Saltar voto',
  CHOOSE_VOTE: 'Toca a un jugador para votar o salta el voto',
  ALREADY_VOTED: 'Ya votaste. Esperando a los demás…',
  GHOST_CANNOT_VOTE: 'Eres un fantasma: puedes leer el chat, pero no votar',
  CHAT: 'Chat',
  CHAT_PLACEHOLDER: 'Escribe un mensaje (Enter para enviar)',
  GHOST_CHAT_PLACEHOLDER: 'Los fantasmas no pueden escribir',
  SEND: 'Enviar',
  SENDING: 'enviando…',
  EJECTED_IMPOSTOR: (name: string) => `${name} era el impostor`,
  EJECTED_CREW: (name: string) => `${name} no era el impostor`,
  NOBODY_EJECTED: 'Nadie salió: hubo empate o saltaron el voto',
  WAS_EJECTED: (name: string) => `Expulsaron a ${name}`,
  UNKNOWN_PLAYER: 'Alguien',
} as const;

export const MAX_CHAT_LENGTH = 200;

export const END_TEXT = {
  TITLE: 'Fin de la partida',
  CREW_WON: '¡Ganó la tripulación!',
  IMPOSTOR_WON: '¡Ganó el impostor!',
  ENDED: 'La partida terminó',
  IMPOSTOR_WAS: (names: string) => `Impostor: ${names}`,
  COINS_EARNED: (coins: number) => `Ganaste ${coins} monedas`,
  COINS_PENDING: 'Tus monedas aparecerán en tu perfil en unos segundos',
  COINS_CHECK_PROFILE: 'Revisa tus monedas en tu perfil',
  BACK_TO_LOBBY: 'Volver a la sala',
} as const;

// S2-09: botón de acción contextual, embalse y aviso del tanque.
export const ACTION_TEXT = {
  TASK: 'Hacer tarea',
  CLEAN: 'Limpiar',
  REPORT: 'Reportar',
  CONTAMINATE: 'Contaminar',
  // S3-05: arreglar una emergencia.
  FIX_STEAM: 'Cerrar válvula',
  FIX_PIPE: 'Sostener tubería',
  contaminateWait: (seconds: number) => `Contaminar (${seconds} s)`,
  KEY_HINT: 'E',
} as const;

export const HUD_TEXT = {
  reservoir: (pct: number) => `Embalse ${pct} %`,
  TANK_ALERT: '¡Tu tanque se está contaminando!',
} as const;

// Espejo de las reglas de match/internal/room/state.go (S2-03, S2-04).
// El servidor sigue decidiendo; la web solo las usa para el botón y el
// círculo de progreso.
export const GAME_RULES = {
  TANK_RANGE: 40,
  TASK_RANGE: 40,
  REPORT_RANGE: 60,
  CONTAMINATE_MS: 3000,
  CLEAN_MS: 2000,
  // match exige 60 ticks desde que recibe el inicio; con latencia
  // irregular 3000 ms justos a veces le llegan como 59 y la rechaza.
  TASK_MS: 3000 + 150,
  CONTAMINATE_COOLDOWN_MS: 20000,
  // El tanque del impostor sube 1 punto solo cada 5 s: eso no es una
  // contaminación y no debe avisar.
  TANK_ALERT_MIN_RISE: 2,
  TANK_ALERT_MS: 3000,
  // S3-05: emergencias y visión limitada.
  FIX_RANGE: 40,
  STEAM_FIX_MS: 2000 + 150,
  SABOTAGE_COOLDOWN_TICKS: 800,
  TICKS_PER_SECOND: 20,
  VISION_RADIUS: 300,
  STEAM_VISION_FACTOR: 0.5,
  VISION_EDGE: 70, // borde difuminado del círculo
  VISION_SPEED: 300, // unidades por segundo al cerrar o abrir
} as const;

// S3-05: emergencias (iguales si son sabotaje o mala suerte) y el
// menú de sabotaje del impostor.
export const EMERGENCY_TEXT = {
  PIPE_TITLE: '¡Se rompió la tubería principal!',
  pipeHint: (held: number, total: number) =>
    `Dos personas deben sostener los dos extremos a la vez (${held}/${total})`,
  pipeTime: (seconds: number) => `${seconds} s antes de que reviente`,
  STEAM_TITLE: '¡Vapor en la planta de tratamiento!',
  STEAM_HINT: 'La visión se redujo: cierren la válvula de vapor',
} as const;

export const SABOTAGE_TEXT = {
  TITLE: 'Sabotear',
  PIPE: 'Romper tubería',
  STEAM: 'Vapor en la planta',
  pipesLeft: (n: number) => `quedan ${n}`,
  NO_PIPES: 'agotado',
  wait: (seconds: number) => `${seconds} s`,
  ACTIVE: 'emergencia en curso',
} as const;

// Textos de la lista de misiones y los minijuegos de las 3R (S2-11).
export const TASK_TEXT = {
  LIST_TITLE: (done: number, total: number) =>
    `Misiones (${done}/${total})`,
  ALL_DONE: '¡Completaste tus misiones!',
  TYPE_NAMES: {
    reduce: 'Reducir',
    reuse: 'Reutilizar',
    recycle: 'Reciclar',
  },
  GAME_TITLES: {
    reduce: 'Reducir: cierra la fuga',
    reuse: 'Reutilizar: guarda el agua gris',
    recycle: 'Reciclar: filtra el agua',
  },
  ROW: (type: string, zone: string) => `${type} · ${zone}`,
  UNKNOWN_ZONE: 'Zona desconocida',
  DO_TASK: 'Hacer tarea',
  DO_TASK_KEY: 'E',
  CLOSE: 'Cerrar',
  DONE: '¡Listo!',
} as const;
