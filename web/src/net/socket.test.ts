import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMessage } from '@in-filtrados/messages';
import {
  CLOSE_NORMAL,
  CLOSE_REPLACED,
  CLOSE_UNAUTHORIZED,
  GameSocket,
  type SocketLike,
  type SocketStatus,
  reconnectDelay,
} from './socket';

import { session } from '../session';

type Listener = (e?: any) => void;

// session.ts uses localStorage, which node does not have.
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
});

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: ClientMessage[] = [];
  private listeners: Record<string, Listener[]> = {};

  addEventListener(type: string, fn: Listener): void {
    (this.listeners[type] ??= []).push(fn);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void { }

  open(): void {
    this.readyState = 1;
    this.emit('open');
  }
  receive(msg: object): void {
    this.emit('message', { data: JSON.stringify(msg) });
  }
  drop(code: number): void {
    this.readyState = 3;
    this.emit('close', { code });
  }
  private emit(type: string, e?: unknown): void {
    (this.listeners[type] ?? []).forEach((fn) => fn(e));
  }
}

function setup() {
  const sockets: FakeSocket[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const statuses: SocketStatus[] = [];
  let unauthorized = 0;
  const gs = new GameSocket({
    token: 't',
    matchId: 'm-1',
    url: 'ws://test/ws',
    createSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    setTimer: (fn, ms) => timers.push({ fn, ms }),
    clearTimer: () => { },
    onUnauthorized: () => unauthorized++,
  });
  gs.onStatus((s) => statuses.push(s));
  gs.connect();
  return { gs, sockets, timers, statuses, unauthorized: () => unauthorized };
}

const snapshot = (tick: number) => ({
  type: 'snapshot',
  tick,
  phase: 'PLAYING',
  players: [],
});

describe('reconnectDelay', () => {
  it('waits 0.5, 1, 2, 4, 8 and then 10 s forever', () => {
    const delays = [1, 2, 3, 4, 5, 6, 7, 50].map(reconnectDelay);
    expect(delays).toEqual([
      500, 1000, 2000, 4000, 8000, 10000, 10000, 10000,
    ]);
  });
});

describe('GameSocket', () => {
  it('sends join with lastTick 0 when it opens', () => {
    const { sockets } = setup();
    sockets[0].open();
    expect(sockets[0].sent).toEqual([
      { type: 'join', matchId: 'm-1', lastTick: 0 },
    ]);
  });

  it('reconnects after a drop and joins with the last tick', () => {
    const { sockets, timers, statuses } = setup();
    sockets[0].open();
    sockets[0].receive(snapshot(41));
    sockets[0].receive(snapshot(42));

    sockets[0].drop(1006);
    expect(statuses.at(-1)).toEqual({ state: 'reconnecting', attempt: 1 });
    expect(timers.map((t) => t.ms)).toEqual([500]);

    timers[0].fn();
    sockets[1].open();
    expect(sockets[1].sent).toEqual([
      { type: 'join', matchId: 'm-1', lastTick: 42 },
    ]);
    expect(statuses.at(-1)).toEqual({ state: 'connected' });
  });

  it('keeps retrying with growing waits while the server is down', () => {
    const { sockets, timers, statuses } = setup();
    for (let i = 0; i < 7; i++) {
      sockets[i].drop(1006);
      timers[i].fn();
    }
    expect(timers.map((t) => t.ms)).toEqual([
      500, 1000, 2000, 4000, 8000, 10000, 10000,
    ]);
    expect(statuses.at(-1)).toEqual({ state: 'reconnecting', attempt: 7 });

    // Once it connects again, the count starts over.
    sockets[7].open();
    sockets[7].drop(1011);
    expect(timers.at(-1)!.ms).toBe(500);
  });

  it('joins the matchId saved in the session', () => {
    session.saveSession({
      token: 't',
      playerId: 'p',
      username: 'u',
      matchId: 'm-saved',
    });
    const { sockets } = setup();
    sockets[0].open();
    expect(sockets[0].sent[0]).toMatchObject({ matchId: 'm-saved' });
  });

  it('clears the session on 4001', () => {
    session.saveSession({ token: 't', playerId: 'p', username: 'u' });
    const { sockets } = setup();
    sockets[0].drop(CLOSE_UNAUTHORIZED);
    expect(session.loadSession()).toBeNull();
  });

  it('does not retry on a normal close', () => {
    const { sockets, timers } = setup();
    sockets[0].open();
    sockets[0].drop(CLOSE_NORMAL);
    expect(timers).toHaveLength(0);
  });

  it('con un cierre 4002 no se reintenta y la sesión sigue', () => {
    session.saveSession({ token: 't', playerId: 'p', username: 'u' });
    const { sockets, timers, statuses } = setup();
    sockets[0].open();
    sockets[0].drop(CLOSE_REPLACED);
    expect(timers).toHaveLength(0);
    expect(session.loadSession()).not.toBeNull();
    expect(session.loadSession()?.token).toBe('t');
    expect(statuses).toContainEqual({ state: 'replaced' });
  });

  it('goes back to login on 4001 and does not retry', () => {
    const { sockets, timers, unauthorized } = setup();
    sockets[0].open();
    sockets[0].drop(CLOSE_UNAUTHORIZED);
    expect(timers).toHaveLength(0);
    expect(unauthorized()).toBe(1);
  });

  it('close() stops a pending retry', () => {
    const { gs, sockets, timers } = setup();
    sockets[0].drop(1006);
    gs.close();
    timers[0].fn();
    expect(sockets).toHaveLength(1);
  });

  it('ignores events from a socket it already replaced', () => {
    const { sockets, timers, statuses } = setup();
    sockets[0].drop(1006);
    timers[0].fn();
    sockets[1].open();
    const before = statuses.length;
    sockets[0].drop(1006); // late event from the old socket
    expect(statuses.length).toBe(before);
    expect(timers).toHaveLength(1);
  });
});
