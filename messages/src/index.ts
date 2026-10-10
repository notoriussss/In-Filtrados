// WebSocket contract between web and gateway (docs/tasks.md, section 0.5).
// Add new messages here only; never redefine them in web/ or gateway/.

// Browser -> gateway
export type ClientMessage =
  | { type: 'join'; matchId: string; lastTick: number }
  | { type: 'move'; dx: -1 | 0 | 1; dy: -1 | 0 | 1 }
  | { type: 'start' }; // solo el creador; match lo valida

// Gateway -> browser
export type ServerMessage =
  | { type: 'snapshot'; tick: number; phase: Phase; players: PlayerView[] }
  | { type: 'error'; code: ErrorCode; message: string };

export type Phase = 'LOBBY' | 'PLAYING' | 'MEETING' | 'ENDED';

export type PlayerView = {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  connected: boolean;
  alive: boolean;
};

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'MATCH_NOT_FOUND'
  | 'SERVICE_UNAVAILABLE'
  | 'BAD_MESSAGE';
