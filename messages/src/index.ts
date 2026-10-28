// WebSocket contract between web and gateway (docs/tasks.md, section 0.5).
// Add new messages here only; never redefine them in web/ or gateway/.

// Browser -> gateway
export type ClientMessage =
  // primer mensaje al conectar
  | { type: 'join'; matchId: string; lastTick: number }
  | { type: 'move'; dx: -1 | 0 | 1; dy: -1 | 0 | 1 }
  | { type: 'start' } // solo el creador; match lo valida
  // S2-01: acciones del juego completo.
  | InteractMessage
  | { type: 'contaminate'; tankSlot: number } // solo el impostor
  | { type: 'report'; tankSlot: number } // un tanque muerto
  | { type: 'vote'; targetPlayerId: string | null } // null = saltar
  | { type: 'chat'; clientMsgId: string; text: string } // solo en MEETING
  // S3-05: sabotear (solo el impostor) y arreglar una emergencia en un
  // punto de reparación de shared/map.json (fixPoints).
  | { type: 'sabotage'; kind: EmergencyKind }
  | { type: 'fix'; pointId: string }
  // Elegir color en LOBBY; match lo acepta si nadie conectado lo tiene.
  | { type: 'pickColor'; color: string }
  // Elegir accesorio en LOBBY.
  | { type: 'pickAccessory'; accessory: string }
  // Personaje en LOBBY: 'jimena' (de inicio) o 'gota' (comprada, de tu color).
  | { type: 'pickSkin'; skin: string }
  // Después de comprar en la tienda: el gateway vuelve a preguntarle a
  // players qué tienes y se lo pasa a match.
  | { type: 'refreshShop' };

// interact: hacer una tarea en una estación. Con tankSlot (lo que mandaban
// los clientes viejos para limpiar un tanque) el servidor lo ignora: los
// tanques no se limpian.
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
  oilDrops: OilDrop[]; // S2-12: rastro del impostor
  // S3-02: en pausa mientras alguien está en su periodo de gracia;
  // waitingFor son los ids de esos jugadores.
  paused: boolean;
  waitingFor: string[];
  // S2-11: las tareas propias (nunca las de otro) y la estación cuya
  // tarea el servidor dio por iniciada; null si ninguna.
  myTasks: MyTask[];
  myActiveTask: string | null;
  // S3-05: emergencia activa (sabotaje o aleatoria: se ven igual) y,
  // solo en el snapshot del impostor, cuándo puede volver a sabotear.
  emergency: Emergency | null;
  mySabotage: SabotageStatus | null;
};

// S3-05: tubería rota o vapor en la planta.
export type EmergencyKind = 'pipe' | 'steam';

export type Emergency = {
  kind: EmergencyKind;
  endsAtTick: number; // pipe: si llega, todos los tanques +20; steam: 0
  heldPoints: string[]; // puntos con alguien arreglando ahora
};

export type SabotageStatus = {
  readyAtTick: number; // espera compartida de 40 s
  pipesLeft: number; // la tubería se rompe máximo 2 veces por partida
};

// Lo que hace un jugador ahora, para animarlo en el mapa. Limpiar y
// contaminar se ven igual ('tank').
export type Activity = 'reduce' | 'reuse' | 'recycle' | 'tank' | 'fix';

// MyTask: una estación asignada al jugador y si ya la hizo (S2-11).
export type MyTask = {
  stationId: string;
  done: boolean;
};

// OilDrop: gota del rastro que deja el impostor tras contaminar (S2-12).
export type OilDrop = {
  x: number;
  y: number;
  color: string;
  expiresAtTick: number;
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
  activity: Activity | null; // S3-05: null si no hace nada
  accessory?: string; // accesorio de la gota; vacío si no lleva
  skin?: string; // 'jimena' (de inicio) o 'gota' (comprada)
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
  votesCast: string[]; // quién ya votó, nunca por quién
  endsAtTick: number;
  votingClosed: boolean;
  ejectedId: string | null;
  wasImpostor: boolean;
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
