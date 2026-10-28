import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import { status } from '@grpc/grpc-js';
import type { ServerMessage } from '@in-filtrados/messages';
import { PlayRelay, playRetryDelay } from './play-relay';

class FakeStream extends EventEmitter {
  written: object[] = [];
  ended = false;
  write(action: object) {
    this.written.push(action);
  }
  end() {
    this.ended = true;
  }
}

function snapshot(tick: number) {
  return {
    event: 'snapshot',
    snapshot: {
      tick,
      phase: 'PLAYING',
      players: [],
      tanks: [],
      reservoir: 0,
      myRole: 'CREW',
      myTaskProgress: { completed: 0, total: 4 },
      meeting: null,
      chat: [],
      oilDrops: [],
      paused: false,
      waitingFor: [],
    },
  };
}

function setup() {
  const streams: FakeStream[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const got: ServerMessage[] = [];
  const unavailable: number[] = [];
  let ended = 0;
  const relay = new PlayRelay({
    open: () => {
      const s = new FakeStream();
      streams.push(s);
      return s;
    },
    join: { matchId: 'm1', playerId: 'p1', lastTick: 0 },
    onMessage: (msg) => got.push(msg),
    onUnavailable: (attempt) => unavailable.push(attempt),
    onEnd: () => ended++,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: () => undefined,
  });
  return { relay, streams, timers, got, unavailable, ended: () => ended };
}

test('opens Play with join and forwards snapshots', () => {
  const t = setup();
  t.relay.start();
  assert.deepEqual(t.streams[0].written[0], {
    join: { matchId: 'm1', playerId: 'p1', lastTick: 0 },
  });
  t.streams[0].emit('data', snapshot(42));
  assert.equal(t.got.length, 1);
  assert.equal(t.got[0].type, 'snapshot');
});

test('a dropped stream is reopened with growing waits and lastTick', () => {
  const t = setup();
  t.relay.start();
  t.streams[0].emit('data', snapshot(120));

  // match se reinicia: el stream termina con UNAVAILABLE.
  t.streams[0].emit('error', new Error('UNAVAILABLE'));
  t.streams[0].emit('status', { code: status.UNAVAILABLE });
  assert.deepEqual(t.unavailable, [1]);
  assert.equal(t.relay.connected, false);
  assert.equal(t.timers[0].ms, 500);

  // Sigue caído: la espera crece.
  t.timers[0].fn();
  t.streams[1].emit('status', { code: status.UNAVAILABLE });
  assert.equal(t.timers[1].ms, 1000);

  // Vuelve: Join con el último tick visto y la espera se reinicia.
  t.timers[1].fn();
  assert.deepEqual(t.streams[2].written[0], {
    join: { matchId: 'm1', playerId: 'p1', lastTick: 120 },
  });
  t.streams[2].emit('data', snapshot(121));
  t.streams[2].emit('status', { code: status.UNAVAILABLE });
  assert.equal(t.timers[2].ms, 500);
  assert.equal(t.ended(), 0);
});

test('a stream that ends with OK closes the WebSocket', () => {
  const t = setup();
  t.relay.start();
  t.streams[0].emit('status', { code: status.OK });
  assert.equal(t.ended(), 1);
  assert.equal(t.timers.length, 0);
});

test('close ends the stream and stops retrying', () => {
  const t = setup();
  t.relay.start();
  t.relay.close();
  assert.equal(t.streams[0].ended, true);
  t.streams[0].emit('status', { code: status.CANCELLED });
  assert.equal(t.timers.length, 0);
});

test('writes go to the current stream', () => {
  const t = setup();
  t.relay.start();
  t.relay.write({ move: { dx: 1, dy: 0 } });
  assert.deepEqual(t.streams[0].written[1], { move: { dx: 1, dy: 0 } });
});

test('retry delays grow up to 10 s', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 9].map(playRetryDelay),
    [500, 1000, 2000, 4000, 8000, 10000, 10000],
  );
});

test('setOwned tells match now and every later Join', () => {
  const t = setup();
  t.relay.start();
  t.relay.setOwned(['gota-e6194b']);
  assert.deepEqual(t.streams[0].written[1], {
    setOwned: { items: ['gota-e6194b'] },
  });
  // Play se cae y se reabre: el nuevo Join ya trae lo comprado.
  t.streams[0].emit('status', { code: status.UNAVAILABLE });
  t.timers[0].fn();
  assert.deepEqual(t.streams[1].written[0], {
    join: {
      matchId: 'm1',
      playerId: 'p1',
      lastTick: 0,
      owned: ['gota-e6194b'],
    },
  });
});
