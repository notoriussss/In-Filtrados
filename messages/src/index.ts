// WebSocket contract between web and gateway (docs/tasks.md, section 0.5).
// Add new messages here only; never redefine them in web/ or gateway/.

// Browser -> gateway
export type ClientMessage =
  | { type: 'join'; matchId: string; lastTick: number } // first message after connecting
  | { type: 'move'; dx: -1 | 0 | 1; dy: -1 | 0 | 1 }
  | { type: 'start' } // solo el creador; match lo valida
  // S2-01: acciones del juego completo.
  | InteractMessage
  | { type: 'contaminate'; tankSlot: number } // solo el impostor
  | { type: 'report'; tankSlot: number } // un tanque muerto
  | { type: 'vote'; targetPlayerId: string | null } // null = saltar
  | { type: 'chat'; clientMsgId: string; text: string }; // solo en MEETING

// interact: hacer una tarea en una estación o limpiar un tanque.
// completed se manda al terminar el minijuego (S2-04).
export type InteractMessage =
  | { type: 'interact'; stationId: string; completed?: boolean }
  | { type: 'interact'; tankSlot: number };

// Gateway -> browser
export type ServerMessage =
  | Snapshot
  | { type: 'matchEnded'; winner: Winner; impostorIds: string[] }
  | { type: 'error'; code: ErrorCode; message: string };

export type Snapshot = {
  type: 'snapshot';
  tick: number;
  phase: Phase;
  players: PlayerView[];
  // S2-01: estado del juego completo.
  tanks: TankView[];
  reservoir: number; // 0 a 100
  myRole: Role; // solo el propio; nunca llega el rol de otro jugador
  myTaskProgress: TaskProgress;
  meeting: Meeting | null; // solo en MEETING
  chat: ChatMessage[]; // últimos 30 mensajes
};

export type Phase = 'LOBBY' | 'PLAYING' | 'MEETING' | 'ENDED';

export type Role = 'NO_ROLE' | 'CREW' | 'IMPOSTOR';

export type Winner = 'crew' | 'impostor';

export type PlayerView = {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  connected: boolean;
  alive: boolean;
};

export type TankView = {
  slot: number;
  ownerId: string;
  contamination: number; // 0 a 100
  dead: boolean;
};

export type TaskProgress = {
  completed: number;
  total: number;
};

export type Meeting = {
  reporterId: string;
  tankSlot: number;
  lastVisitors: string[]; // últimos 3 jugadores distintos junto al tanque
  votesCast: string[]; // quién ya votó, nunca por quién
  endsAtTick: number;
};

export type ChatMessage = {
  id: string; // clientMsgId
  playerId: string;
  text: string;
  tick: number;
};

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'MATCH_NOT_FOUND'
  | 'SERVICE_UNAVAILABLE'
  | 'BAD_MESSAGE';
