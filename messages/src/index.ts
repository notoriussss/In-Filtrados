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
  // Mesa: convocar una reunión desde la mesa del mirador.
  | { type: 'callMeeting' }
  // Elegir color en LOBBY; match lo acepta si nadie conectado lo tiene.
  | { type: 'pickColor'; color: string }
  // Cuántas tareas hace cada jugador (4 a 8, por defecto 6). Solo el
  // creador y solo en LOBBY; fuera de rango match responde un error
  // INVALID_TASK_COUNT.
  | { type: 'setTaskCount'; tasksPerPlayer: number }
  // Cuántos infiltrados hay: de 1 a (jugadores - 1) / 2. Solo el creador y
  // solo en LOBBY; fuera de rango match responde INVALID_IMPOSTOR_COUNT.
  | { type: 'setImpostorCount'; impostors: number }
  // Cuántos minutos dura la partida (4 a 12, por defecto 8). Solo el
  // creador y solo en LOBBY; fuera de rango match responde
  // INVALID_MATCH_DURATION.
  | { type: 'setMatchDuration'; minutes: number }
  // Elegir accesorio en LOBBY.
  | { type: 'pickAccessory'; accessory: string }
  // Personaje en LOBBY: 'jimena' (de inicio) o 'gota' (comprada, de tu color).
  | { type: 'pickSkin'; skin: string }
  // Después de comprar en la tienda: el gateway vuelve a preguntarle a
  // players qué tienes y se lo pasa a match.
  | { type: 'refreshShop' }
  // El jugador tocó "Salir" a propósito (no es perder la conexión). Si es
  // el creador, match cierra la sala para todos con reason 'host_left'.
  | { type: 'leave' }
  // Heartbeat (deployment-lab.md, 9.1): cada 2 s; el gateway responde
  // pong y nunca lo reenvía a match.
  | { type: 'ping' };

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
  | {
      type: 'matchEnded';
      winner: Winner | null; // null: la sala se cerró sin ganador
      // host_left: el creador salió a propósito.
      impostorIds: string[];
      reason?: EndReason;
    }
  | { type: 'error'; code: ErrorCode; message: string }
  | { type: 'pong' }; // respuesta al ping del navegador

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
  // S3-02: en pausa solo mientras el host está en su periodo de gracia;
  // waitingFor son los ids de todos los que están en gracia.
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
  // Mesa: estado de la mesa de reuniones; null fuera de PLAYING.
  myMeeting: MeetingButton | null;
  // Tareas que hace cada jugador (cuidador o impostor); 4 a 8.
  tasksPerPlayer: number;
  // Infiltrados de la partida (ya recortados al tope de los jugadores que
  // hay) y minutos que dura; se ven en LOBBY.
  impostors: number;
  matchMinutes: number;
  // Tick en que se acaba el tiempo y ganan los infiltrados (reason
  // 'timeout'); 0 en LOBBY y ENDED. Lo que falta es matchEndsAtTick - tick
  // a 20 ticks por segundo. Se congela en las reuniones (el fin se corre) y
  // en la pausa (el tick no avanza).
  matchEndsAtTick: number;
};

export type MeetingButton = {
  readyAtTick: number; // próximo tick en que se puede convocar
  callsLeft: number; // convocatorias que quedan en la partida
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

// Motivos por los que termina la partida (S2-06).
export type EndReason =
  | 'reservoir_full'
  | 'impostors_ejected'
  | 'tanks_contaminated'
  | 'timeout'
  | 'host_left';

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
  dead: boolean; // contaminación 100: el tanque se puede reportar
  reported: boolean; // ya tuvo su reunión: no se reporta otra vez
};

export type TaskProgress = {
  completed: number;
  total: number;
};

export type MeetingReason = 'report' | 'emergency';

export type Meeting = {
  reporterId: string;
  tankSlot: number; // -1 si la reunión fue convocada
  reason: MeetingReason;
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
  | 'BAD_MESSAGE'
  | 'INVALID_TASK_COUNT'
  | 'INVALID_IMPOSTOR_COUNT'
  | 'INVALID_MATCH_DURATION'
  | 'MEETING_IN_PROGRESS'
  | 'REPORT_NOT_ALIVE'
  | 'UNKNOWN_TANK'
  | 'TANK_NOT_POLLUTED'
  | 'TANK_ALREADY_REPORTED'
  | 'REPORT_TOO_FAR';
