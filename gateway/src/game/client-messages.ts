import type {
  ClientMessage,
  InteractMessage,
} from '@in-filtrados/messages';
import {
  EMERGENCY_KINDS,
  MAX_ACCESSORY_LENGTH,
  MAX_CHAT_LENGTH,
  MAX_COLOR_LENGTH,
  MAX_CLIENT_MSG_ID_LENGTH,
  MAX_FIX_POINT_ID_LENGTH,
  MAX_PLAYER_ID_LENGTH,
  MAX_STATION_ID_LENGTH,
  MAX_TANK_SLOT,
} from './game.constants';

// parseClientMessage lets through only the messages of
// messages/src/index.ts, with valid types and ranges; anything else
// returns null and the gateway answers BAD_MESSAGE.
export function parseClientMessage(raw: string): ClientMessage | null {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null; // not JSON
  }
  switch (msg?.type) {
    case 'join':
      if (typeof msg.matchId !== 'string') return null;
      return {
        type: 'join',
        matchId: msg.matchId,
        lastTick: Number(msg.lastTick) || 0,
      };
    case 'move':
      if (!isAxis(msg.dx) || !isAxis(msg.dy)) return null;
      return { type: 'move', dx: msg.dx, dy: msg.dy };
    case 'start':
      return { type: 'start' };
    case 'contaminate':
      if (!isSlot(msg.tankSlot)) return null;
      return { type: 'contaminate', tankSlot: msg.tankSlot };
    case 'interact':
      return parseInteract(msg);
    case 'report':
      if (!isSlot(msg.tankSlot)) return null;
      return { type: 'report', tankSlot: msg.tankSlot };
    case 'vote':
      return parseVote(msg);
    case 'chat':
      return parseChat(msg);
    case 'sabotage':
      // S3-05: match revisa que sea el impostor y las esperas.
      if (!EMERGENCY_KINDS.includes(msg.kind)) return null;
      return { type: 'sabotage', kind: msg.kind };
    case 'fix':
      if (!isShortString(msg.pointId, MAX_FIX_POINT_ID_LENGTH)) {
        return null;
      }
      return { type: 'fix', pointId: msg.pointId };
    case 'pickColor':
      // match revisa la fase y que el color esté libre.
      if (!isShortString(msg.color, MAX_COLOR_LENGTH)) return null;
      return { type: 'pickColor', color: msg.color };
    case 'pickAccessory':
      if (!isShortString(msg.accessory, MAX_ACCESSORY_LENGTH)) {
        return null;
      }
      return { type: 'pickAccessory', accessory: msg.accessory };
    default:
      return null;
  }
}

// toGrpcAction turns a game message into the ClientAction of
// proto/match.proto. join is not here: the gateway builds it with the
// playerId of the token, never one sent by the browser.
export function toGrpcAction(msg: ClientMessage): object | null {
  switch (msg.type) {
    case 'move':
      return { move: { dx: msg.dx, dy: msg.dy } };
    case 'start':
      return { start: {} };
    case 'contaminate':
      return { contaminate: { tankSlot: msg.tankSlot } };
    case 'interact':
      return { interact: toGrpcInteract(msg) };
    case 'report':
      return { report: { tankSlot: msg.tankSlot } };
    case 'vote':
      return {
        vote:
          msg.targetPlayerId === null
            ? { skip: true }
            : { targetPlayerId: msg.targetPlayerId },
      };
    case 'chat':
      return {
        chat: { clientMsgId: msg.clientMsgId, text: msg.text },
      };
    case 'sabotage':
      return { sabotage: { kind: msg.kind } };
    case 'fix':
      return { fix: { pointId: msg.pointId } };
    case 'pickColor':
      return { pickColor: { color: msg.color } };
    case 'pickAccessory':
      return { pickAccessory: { accessory: msg.accessory } };
    default:
      return null;
  }
}

// S2-03: interact sobre un tanque (limpiar) o una estación (S2-04).
function parseInteract(msg: {
  stationId?: unknown;
  tankSlot?: unknown;
  completed?: unknown;
}): InteractMessage | null {
  if (isSlot(msg.tankSlot)) {
    return { type: 'interact', tankSlot: msg.tankSlot };
  }
  if (isShortString(msg.stationId, MAX_STATION_ID_LENGTH)) {
    return {
      type: 'interact',
      stationId: msg.stationId,
      completed: msg.completed === true,
    };
  }
  return null;
}

// S2-10: votar por un jugador o saltar (targetPlayerId: null).
function parseVote(msg: { targetPlayerId?: unknown }): ClientMessage | null {
  if (msg.targetPlayerId === null) {
    return { type: 'vote', targetPlayerId: null };
  }
  if (isShortString(msg.targetPlayerId, MAX_PLAYER_ID_LENGTH)) {
    return { type: 'vote', targetPlayerId: msg.targetPlayerId };
  }
  return null;
}

// S2-10: chat de la reunión; match revisa la fase, si está vivo y el
// límite de 1 mensaje por segundo.
function parseChat(msg: {
  clientMsgId?: unknown;
  text?: unknown;
}): ClientMessage | null {
  if (!isShortString(msg.clientMsgId, MAX_CLIENT_MSG_ID_LENGTH)) {
    return null;
  }
  if (typeof msg.text !== 'string') return null;
  const text = msg.text.trim();
  if (text.length === 0 || [...text].length > MAX_CHAT_LENGTH) {
    return null;
  }
  return { type: 'chat', clientMsgId: msg.clientMsgId, text };
}

function toGrpcInteract(msg: InteractMessage): object {
  if ('tankSlot' in msg) {
    return { tankSlot: msg.tankSlot };
  }
  return { stationId: msg.stationId, completed: msg.completed ?? false };
}

function isAxis(value: unknown): value is -1 | 0 | 1 {
  return value === -1 || value === 0 || value === 1;
}

function isSlot(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= MAX_TANK_SLOT
  );
}

function isShortString(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max
  );
}
