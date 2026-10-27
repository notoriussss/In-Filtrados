// Textos que ve el jugador en las pantallas de React (regla 9 de
// AGENTS.md). Los del juego (acciones, reunión, errores) siguen en
// constants.ts.

export const APP_TEXT = {
  TITLE_A: 'In-',
  TITLE_B: 'Filtrados',
  REDUCE: 'Reducir',
  REUSE: 'Reutilizar',
  RECYCLE: 'Reciclar',
  VERSION: 'Computación en la Nube · v1.0',
} as const;

export const BOOT_TEXT = {
  LOADING: 'Conectando con la estación…',
  STEP_FONTS: 'Fuentes',
  STEP_MAP: 'Mapa',
  STEP_CHARACTERS: 'Personajes',
  STEP_SERVER: 'Servidor',
  TIP_TITLE: 'Consejo 3R',
  TIP: 'Cerrar una fuga a tiempo ahorra más agua que filtrarla después.',
  FAILED: 'No se pudieron descargar los recursos del juego',
  RETRY: 'Reintentar',
} as const;

export const ACCESS_TEXT = {
  TITLE: 'Entra a la estación',
  LOGIN_TAB: 'Entrar',
  REGISTER_TAB: 'Crear cuenta',
  USERNAME: 'Usuario',
  PASSWORD: 'Contraseña',
  USERNAME_RULE: '3 a 20 caracteres, sin espacios: letras, números y _',
  PASSWORD_RULE: 'Mínimo 8 caracteres',
  // Lo que se le dice al jugador mientras escribe (accountRules.ts).
  USERNAME_BAD_CHARS: 'Solo letras sin acento, números y _ (sin espacios)',
  usernameTooShort: (min: number) => `Muy corto: mínimo ${min} caracteres`,
  usernameTooLong: (max: number, used: number) =>
    `Muy largo: máximo ${max} caracteres (llevas ${used})`,
  passwordMissing: (missing: number) =>
    missing === 1
      ? 'Falta 1 carácter para llegar al mínimo de 8'
      : `Faltan ${missing} caracteres para llegar al mínimo de 8`,
  USERNAME_OK: 'Usuario válido',
  PASSWORD_OK: 'Contraseña válida',
  YOUR_GOTA: 'Tu gota',
  COLOR_NOTE: 'Tu color se asigna al entrar a una sala.',
  LOGIN: 'Entrar',
  REGISTER: 'Crear cuenta',
  SENDING: 'Un momento…',
  CREATED: 'Cuenta creada. Ya puedes entrar.',
  HINT_NEXT: 'Siguiente campo',
  HINT_SEND: 'Continuar',
} as const;

export const MENU_TEXT = {
  CREATE: 'Crear sala',
  JOIN: 'Unirse con código',
  HELP: 'Cómo jugar',
  SETTINGS: 'Ajustes',
  LOGOUT: 'Cerrar sesión',
  CONNECTED: 'Conectado',
  OFFLINE: 'Sin conexión',
  ping: (ms: number) => `${ms} ms`,
  coins: (n: number) => `${n} monedas`,
  stats: (matches: number, wins: number) =>
    `${matches} partidas · ${wins} victorias`,
  impostorStats: (times: number, wins: number) =>
    `Infiltrado ${times} veces · ganó ${wins}`,
  HINT_CHOOSE: 'Elegir',
  HINT_ACCEPT: 'Aceptar',
  JOIN_SHORT: 'Unirse a sala',
  SHOP: 'Tienda',
  TAGLINE: 'Cada gota cuenta',
  PROFILE: 'Perfil',
  MENU_ARIA: 'Menú principal',
} as const;

export const JOIN_TEXT = {
  TITLE: 'Unirse con código',
  CODE: 'Código de sala',
  PASTE: 'Pegar',
  VALID: 'Código válido',
  RULE:
    'El código tiene 4 letras y números. ' + 'Pídeselo a quien creó la sala.',
  BACK: 'Volver',
  JOIN: 'Unirme',
  NOT_FOUND: 'No existe una sala con ese código',
  FULL: 'La sala está llena',
} as const;

export const LOBBY_TEXT = {
  TITLE: 'Sala de espera',
  LEAVE: 'Salir',
  COPY: 'Copiar',
  COPIED: 'Copiado',
  YOUR_GOTA: 'Tu gota',
  COLOR: 'Color',
  ACCESSORY: 'Accesorio',
  CHOOSE_ACCESSORY: 'Elegir accesorio',
  NO_ACCESSORY: 'Sin accesorio',
  CHARACTER: 'Personaje',
  CHARACTER_JIMENA: 'Jimena',
  CHARACTER_GOTA: 'Gota',
  LOCKED: 'Bloqueado',
  lockedHint: (name: string) => `${name} · bloqueado, cómpralo en la tienda`,
  ACCESSORY_NEEDS_GOTA:
    'Los accesorios solo se ven en los personajes gota.',
  CLOSE: 'Cerrar',
  PROFILE: 'Tu perfil',
  COINS: 'Monedas',
  MATCHES: 'Partidas',
  WINS: 'Victorias',
  TIMES_IMPOSTOR: 'Infiltrado',
  WINS_IMPOSTOR: 'Ganó como infiltrado',
  PLAYERS: 'Jugadores',
  connected: (n: number) => `${n} conectados`,
  YOU: '(tú)',
  HOST: 'Anfitrión',
  READY: 'Conectado',
  OFFLINE: 'Desconectado',
  WAITING: 'Esperando jugador…',
  impostors: (n: number) => (n === 1 ? '1 infiltrado' : `${n} infiltrados`),
  TASKS: '4 tareas',
  DURATION: '8 min',
  onlyHost: (name: string) => `Solo ${name} puede iniciar la partida.`,
  HOW_TO_WIN: 'Cómo se gana',
  WIN_CREW:
    'Tripulantes: llenen el embalse con las tareas ' +
    '3R o expulsen al infiltrado.',
  WIN_IMPOSTOR:
    'Infiltrado: contamina tanques hasta igualar a la ' +
    'tripulación o aguanta 8 minutos.',
  MIN_PLAYERS: 'Mínimo 2 jugadores para empezar',
  START: 'Iniciar partida',
  waitingFor: (name: string) => `Esperando a que ${name} inicie`,
} as const;

export const HELP_TEXT = {
  TITLE: 'Cómo jugar In-Filtrados',
  DURATION: 'Una partida dura hasta 8 minutos',
  TASKS: 'Las 3R: tus tareas',
  REDUCE_SUB: 'Evita el desperdicio',
  REDUCE_1: 'Repara fugas y cierra válvulas de la estación.',
  REDUCE_2: 'Cada tarea llena un poco el embalse comunitario.',
  REUSE_SUB: 'Dale otra vida al agua',
  REUSE_1: 'Junta agua de lluvia y agua gris con la cubeta.',
  REUSE_2: 'Arrastra las cubetas al tanque para guardarla.',
  RECYCLE_SUB: 'Devuelve agua limpia',
  RECYCLE_1: 'Filtra el agua sucia y clasifica los residuos.',
  RECYCLE_2: 'Toca la suciedad que flota hasta dejarla limpia.',
  ROLES: 'Roles',
  CREW: 'Tripulante',
  CREW_TEXT: 'Haz tus 4 tareas, limpia los tanques y vota en las reuniones.',
  CREW_WIN: 'Ganan: embalse lleno o infiltrado expulsado',
  IMPOSTOR: 'Infiltrado',
  IMPOSTOR_TEXT:
    'Contamina los tanques sin que te vean ' + 'y sabotea la estación.',
  IMPOSTOR_WIN: 'Gana: tanques arruinados o fin del tiempo',
  MEETING_POINT: 'Reuniones',
  MEETING_POINT_TEXT:
    'Al reportar un tanque todos aparecen en la Mesa de reuniones ' +
    '(mirador del centro); en el mapa es «Reunión».',
  CONTROLS: 'Controles',
  MOVE: 'Mover',
  USE: 'Usar',
  SABOTAGE: 'Sabotear',
  MENU: 'Menú',
  CLOSE: 'Cerrar',
} as const;

export const ROLE_TEXT = {
  BADGE: 'Tu rol en esta partida',
  CREW: 'Eres Tripulante',
  IMPOSTOR: 'Eres Infiltrado',
  CREW_SUB: 'Completa tus tareas 3R y descubre quién ensucia el agua.',
  IMPOSTOR_SUB: 'Ensucia los tanques sin que te descubran.',
  MATES: 'En la estación',
  MEETING_NOTE:
    'En una reunión todos van a la Mesa de reuniones, en el centro del mapa.',
  startsIn: (s: number) => `La partida empieza en ${s}`,
} as const;

export const HUD_TEXT = {
  TASKS: 'Tareas',
  DONE: 'Hecho',
  MISSING: 'Falta',
  TEAM: 'Equipo',
  RESERVOIR: 'Embalse',
  LEVEL: 'Nivel',
  PURITY: 'Pureza',
  CREW: 'Tripulante',
  IMPOSTOR: 'Infiltrado',
  GHOST: 'Fantasma',
  MY_TANK: 'Tanque',
  NO_TANK: 'sin tanque',
  MAP: 'Mapa',
  MEETING_POINT: 'Reunión',
  USE: 'Usar',
  CLEAN: 'Limpiar',
  REPORT: 'Reportar',
  CONTAMINATE: 'Contaminar',
  FIX: 'Arreglar',
  PIPE: 'Tubería',
  STEAM: 'Vapor',
  TANK_ALERT: '¡Tu tanque se está contaminando!',
  TANK_ALERT_HINT: 'Ve a limpiarlo antes de que se arruine',
  PAUSED: 'Partida en pausa',
  waiting: (names: string) => `Esperando a ${names}`,
  percent: (n: number) => `${n}%`,
} as const;

export const PAUSE_TEXT = {
  TITLE: 'Menú de partida',
  room: (code: string) => `Sala ${code}`,
  NOTE: 'La partida sigue para los demás mientras tienes el menú abierto.',
  RESUME: 'Continuar',
  HELP: 'Cómo jugar',
  SETTINGS: 'Ajustes',
  LEAVE: 'Salir de la sala',
  LEAVE_NOTE: 'Si sales en plena partida, quedarás como desconectado.',
} as const;

export const CONNECTION_TEXT = {
  RECONNECTING: 'Reconectando…',
  attempt: (n: number) => `Intento ${n}`,
  RECONNECTING_TEXT:
    'Perdimos la conexión con la estación. Tu lugar en ' +
    'la sala se guarda mientras vuelves.',
  UNAVAILABLE: 'Servicio no disponible',
  UNAVAILABLE_TEXT:
    'El servidor de partidas no responde. Reintentamos solos en unos segundos.',
  REPLACED: 'Sesión reemplazada',
  REPLACED_TEXT: 'Abriste el juego en otra pestaña.',
} as const;

export const MEETING_UI_TEXT = {
  BADGE: 'Reunión de emergencia',
  TITLE: '¿Quién ensució el agua?',
  CHOOSE: 'Elige a quién expulsar',
  reported: (who: string, owner: string) =>
    `${who} reportó el tanque de ${owner}`,
  VOTING: 'Votación',
  GATHERED: 'Todos están en la Mesa de reuniones',
  RESULT: 'Resultado',
  ALIVE: 'Vivo',
  GHOST: 'Fantasma',
  OFFLINE: 'Desconectado',
  REPORTER: 'Reportó',
  VOTED: 'Votó',
  MY_VOTE: 'Tu voto',
  SKIP: 'Saltar voto',
  SECRET: 'Voto secreto hasta el final',
  CHAT: 'Chat',
  CHAT_ALIVE: 'Vivos',
  CHAT_GHOST: 'Solo lectura',
  PLACEHOLDER: 'Escribe un mensaje…',
  GHOST_PLACEHOLDER: 'Los fantasmas no pueden escribir',
  SEND: 'Enviar',
  SENDING: 'enviando…',
  you: (name: string) => `${name} (tú)`,
} as const;

export const EJECT_TEXT = {
  ejected: (name: string) => `${name} fue expulsado`,
  WAS: 'era un Infiltrado',
  WAS_NOT: 'no era un Infiltrado',
  CAUGHT: 'Atraparon al infiltrado',
  STILL: 'El infiltrado sigue suelto',
  NOBODY: 'Nadie fue expulsado',
  NOBODY_SUB: 'Hubo empate o saltaron el voto.',
} as const;

export const RESULT_TEXT = {
  CREW_WON: '¡Ganan los Tripulantes!',
  IMPOSTOR_WON: 'Ganan los Infiltrados',
  ENDED: 'Fin de la partida',
  CREW_SUB: 'El embalse se llenó o el infiltrado quedó fuera.',
  IMPOSTOR_SUB: 'Los tanques se contaminaron o se acabó el tiempo.',
  PLAYERS: 'Jugadores',
  room: (code: string) => `Sala ${code}`,
  PLAYER: 'Jugador',
  ROLE: 'Rol',
  STATE: 'Estado',
  CREW: 'Tripulante',
  IMPOSTOR: 'Infiltrado',
  ALIVE: 'Vivo',
  GHOST: 'Fantasma',
  OFFLINE: 'Desconectado',
  IMPACT: 'Tu impacto 3R',
  tasksOf: (done: number, total: number) => `${done} de ${total} tareas`,
  liters: (l: number) => `${l} L`,
  CLEAN_TANKS: 'tanques sanos',
  RESERVOIR: 'embalse',
  COINS: 'monedas',
  COINS_PENDING: 'Tus monedas aparecen en unos segundos',
  FACT:
    'Dato 3R: cerrar una fuga a tiempo ahorra más ' +
    'agua que filtrar después.',
  EXIT: 'Salir',
  BACK: 'Volver al menú',
} as const;

export const SETTINGS_TEXT = {
  TITLE: 'Ajustes',
  TAB_VIDEO: 'Video',
  TAB_CONTROLS: 'Controles',
  TAB_ACCESS: 'Accesibilidad',
  SCREEN: 'Pantalla',
  SCREEN_SUB: 'Modo de visualización',
  WINDOW: 'Ventana',
  FULLSCREEN: 'Pantalla completa',
  FULLSCREEN_BLOCKED: 'Tu navegador no permite la pantalla completa aquí.',
  MOVE: 'Mover',
  OR_ARROWS: 'o flechas',
  USE: 'Usar / interactuar',
  SABOTAGE: 'Sabotear',
  MENU: 'Menú de partida',
  FIXED: 'Fija',
  CONTROLS_NOTE: 'Las teclas son fijas por ahora; no se pueden cambiar.',
  HIGH_CONTRAST: 'Alto contraste',
  HIGH_CONTRAST_SUB: 'Textos más claros y bordes más marcados',
  REDUCE_MOTION: 'Reducir movimiento',
  REDUCE_MOTION_SUB: 'Sin balanceos ni parpadeos en la interfaz',
  ON: 'Activado',
  OFF: 'Desactivado',
  STORED_NOTE: 'Se guardan en este navegador.',
  BACK: 'Volver',
  RESET: 'Restablecer',
  APPLY: 'Aplicar',
} as const;

// Textos de los componentes de screens/pending (sin soporte del servidor).
export const PENDING_TEXT = {
  CHAT_EMPTY: 'Nadie ha escrito todavía.',
  CHAT_PLACEHOLDER: 'Escribe un mensaje…',
  CHAT_SEND: 'Enviar',
  CHAT_SENDING: 'enviando…',
  COLOR: 'Color',
  ACCESSORY: 'Accesorio',
  ROOMS_EMPTY: 'No hay salas públicas abiertas ahora.',
  ROOM_JOIN: 'Unirse',
  ROOM_FULL: 'Llena',
  roomPlayers: (n: number, max: number) => `${n}/${max} jugadores`,
} as const;

export const SHOP_TEXT = {
  TITLE: 'Tienda',
  BACK: 'Volver',
  COINS: 'Tus monedas',
  CHARACTERS: 'Personajes gota',
  CHARACTERS_SUB:
    'Los personajes de Jimena son gratis. Las gotas se compran, una por color.',
  ACCESSORIES: 'Accesorios',
  ACCESSORIES_SUB: 'Se ven en las gotas. Cada uno se compra una sola vez.',
  BUY: 'Comprar',
  OWNED: 'Tuyo',
  NOT_ENOUGH: 'No te alcanzan las monedas',
  price: (n: number) => `${n} ◆`,
  bought: (name: string) => `Compraste: ${name}`,
  LOADING: 'Cargando la tienda…',
  LOAD_ERROR: 'No se pudo abrir la tienda',
  HINT_WIN: 'Las monedas se ganan jugando: la cosecha y 20 más si gana tu equipo.',
} as const;
