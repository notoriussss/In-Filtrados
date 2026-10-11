import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type GrpcServerEvent, toServerMessage } from './server-events';

test('snapshot keeps only the fields of the contract', () => {
  const ev = {
    event: 'snapshot',
    snapshot: {
      tick: 7,
      phase: 'MEETING',
      players: [],
      tanks: [
        {
          slot: 1,
          ownerId: 'p1',
          contamination: 35,
          dead: false,
          extra: 'x',
        },
      ],
      reservoir: 12,
      myRole: 'IMPOSTOR',
      myTaskProgress: { completed: 1, total: 4 },
      meeting: {
        reporterId: 'p2',
        tankSlot: 1,
        lastVisitors: ['p1'],
        votesCast: [],
        endsAtTick: 900,
      },
      chat: [{ id: 'm1', playerId: 'p2', text: 'hola', tick: 5 }],
      oilDrops: [
        {
          x: 100,
          y: 200,
          color: '#e6194b',
          expiresAtTick: 307,
          extra: 'x',
        },
      ],
    },
  } as unknown as GrpcServerEvent;

  assert.deepEqual(toServerMessage(ev), {
    type: 'snapshot',
    tick: 7,
    phase: 'MEETING',
    players: [],
    tanks: [{ slot: 1, ownerId: 'p1', contamination: 35, dead: false }],
    reservoir: 12,
    myRole: 'IMPOSTOR',
    myTaskProgress: { completed: 1, total: 4 },
    meeting: {
      reporterId: 'p2',
      tankSlot: 1,
      lastVisitors: ['p1'],
      votesCast: [],
      endsAtTick: 900,
    },
    chat: [{ id: 'm1', playerId: 'p2', text: 'hola', tick: 5 }],
    oilDrops: [
      { x: 100, y: 200, color: '#e6194b', expiresAtTick: 307 },
    ],
  });
});

test('snapshot without meeting sends null', () => {
  const ev = {
    event: 'snapshot',
    snapshot: {
      tick: 1,
      phase: 'LOBBY',
      players: [],
      tanks: [],
      reservoir: 0,
      myRole: 'NO_ROLE',
      myTaskProgress: null,
      meeting: null,
      chat: [],
    },
  } as unknown as GrpcServerEvent;

  const msg = toServerMessage(ev);
  assert.equal(msg?.type, 'snapshot');
  if (msg?.type !== 'snapshot') return;
  assert.equal(msg.meeting, null);
  assert.deepEqual(msg.myTaskProgress, { completed: 0, total: 0 });
  assert.deepEqual(msg.oilDrops, []);
});

test('matchEnded keeps winner and impostors', () => {
  const ev: GrpcServerEvent = {
    event: 'matchEnded',
    matchEnded: { winner: 'impostor', impostorIds: ['p3'] },
  };
  assert.deepEqual(toServerMessage(ev), {
    type: 'matchEnded',
    winner: 'impostor',
    impostorIds: ['p3'],
  });
});

test('matchEnded with an unknown winner is dropped', () => {
  const ev: GrpcServerEvent = {
    event: 'matchEnded',
    matchEnded: { winner: '', impostorIds: [] },
  };
  assert.equal(toServerMessage(ev), null);
});
