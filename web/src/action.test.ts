import { describe, expect, it } from 'vitest';
import type {
  ClientMessage,
  PlayerView,
  Snapshot,
  TankView,
} from '@in-filtrados/messages';
import {
  ACTION_KEY,
  ActionKey,
  pickAction,
  pickReportableTank,
  pickTank,
  TANK_RANGE,
} from './action';

const spots = [
  { slot: 0, x: 640, y: 1040 },
  { slot: 1, x: 720, y: 1040 },
  { slot: 2, x: 800, y: 1040 },
];

const tank = (slot: number, ownerId: string, dead = false): TankView => ({
  slot,
  ownerId,
  contamination: 0,
  dead,
});

const baseSnap = (tanks: TankView[]): Snapshot => ({
  type: 'snapshot',
  tick: 1,
  phase: 'PLAYING',
  players: [],
  tanks,
  reservoir: 50,
  myRole: 'CREW',
  myTaskProgress: { completed: 0, total: 4 },
  meeting: null,
  chat: [],
  oilDrops: [],
  paused: false,
  waitingFor: [],
});

const player = (id: string, alive = true): PlayerView => ({
  id,
  name: id,
  color: '#ffffff',
  x: 720,
  y: 1040,
  connected: true,
  alive,
});

describe('pickTank (contaminar)', () => {
  const tanks = [tank(0, 'me'), tank(1, 'p2')];

  it('picks the nearby tank of another player', () => {
    const got = pickTank({ x: 725, y: 1040 }, tanks, spots, 'me');
    expect(got?.slot).toBe(1);
  });

  it('never picks my own tank', () => {
    expect(pickTank({ x: 640, y: 1040 }, tanks, spots, 'me')).toBeNull();
  });

  it('ignores map spots without a tank in the match', () => {
    expect(pickTank({ x: 800, y: 1040 }, tanks, spots, 'me')).toBeNull();
  });

  it('ignores tanks out of range or dead', () => {
    const far = { x: 720, y: 1040 - TANK_RANGE - 1 };
    expect(pickTank(far, tanks, spots, 'me')).toBeNull();
    const dead = [tank(1, 'p2', true)];
    expect(pickTank({ x: 720, y: 1040 }, dead, spots, 'me')).toBeNull();
  });
});

describe('pickReportableTank', () => {
  it('picks dead tank in range', () => {
    const tanks = [tank(0, 'me', true), tank(1, 'p2', false)];
    const got = pickReportableTank({ x: 640, y: 1040 }, tanks, spots);
    expect(got?.slot).toBe(0);
  });

  it('ignores alive tanks', () => {
    const tanks = [tank(0, 'me', false)];
    expect(
      pickReportableTank({ x: 640, y: 1040 }, tanks, spots),
    ).toBeNull();
  });

  it('ignores tanks already reported', () => {
    const tanks = [tank(0, 'me', true)];
    const reported = new Set<number>([0]);
    expect(
      pickReportableTank({ x: 640, y: 1040 }, tanks, spots, reported),
    ).toBeNull();
  });

  it('ignores dead tank out of range', () => {
    const tanks = [tank(0, 'me', true)];
    const far = { x: 640, y: 1040 - TANK_RANGE - 5 };
    expect(pickReportableTank(far, tanks, spots)).toBeNull();
  });
});

describe('pickAction', () => {
  it('prioritizes reporting dead tanks over contaminating', () => {
    const snap: Snapshot = {
      ...baseSnap([tank(0, 'me', true), tank(1, 'p2', false)]),
      myRole: 'IMPOSTOR',
    };
    const act = pickAction({ x: 640, y: 1040 }, snap, spots, 'me');
    expect(act).toEqual({
      type: 'report',
      tank: snap.tanks[0],
    });
  });

  it('picks contaminate for impostor near alive enemy tank', () => {
    const snap: Snapshot = {
      ...baseSnap([tank(0, 'me', false), tank(1, 'p2', false)]),
      myRole: 'IMPOSTOR',
    };
    const act = pickAction({ x: 720, y: 1040 }, snap, spots, 'me');
    expect(act).toEqual({
      type: 'contaminate',
      tank: snap.tanks[1],
    });
  });

  it('does not allow crew to contaminate enemy tanks', () => {
    const snap: Snapshot = {
      ...baseSnap([tank(1, 'p2', false)]),
      myRole: 'CREW',
    };
    const act = pickAction({ x: 720, y: 1040 }, snap, spots, 'me');
    expect(act).toBeNull();
  });
});

describe('ActionKey', () => {
  it('triggers on KeyE to report dead tank', () => {
    const sent: ClientMessage[] = [];
    const snap = baseSnap([tank(1, 'p2', true)]);
    const me = player('me');
    const actionKey = new ActionKey(
      'me',
      () => me,
      () => snap,
      (msg) => sent.push(msg),
    );

    actionKey.keyDown({ code: ACTION_KEY });
    expect(sent).toEqual([{ type: 'report', tankSlot: 1 }]);
  });

  it('allows retrying report on unconfirmed or rejected attempt', () => {
    const sent: ClientMessage[] = [];
    const snap = baseSnap([tank(1, 'p2', true)]);
    const me = player('me');
    const actionKey = new ActionKey(
      'me',
      () => me,
      () => snap,
      (msg) => sent.push(msg),
    );

    actionKey.keyDown({ code: ACTION_KEY });
    expect(sent).toEqual([{ type: 'report', tankSlot: 1 }]);

    // Sin meeting del servidor, otra pulsación vuelve a mandar report
    actionKey.keyDown({ code: ACTION_KEY });
    expect(sent).toEqual([
      { type: 'report', tankSlot: 1 },
      { type: 'report', tankSlot: 1 },
    ]);
  });

  it('stops reporting once meeting snapshot confirms reported tank', () => {
    const sent: ClientMessage[] = [];
    let snap = baseSnap([tank(1, 'p2', true)]);
    const me = player('me');
    const actionKey = new ActionKey(
      'me',
      () => me,
      () => snap,
      (msg) => sent.push(msg),
    );

    actionKey.keyDown({ code: ACTION_KEY });
    expect(sent).toHaveLength(1);

    // Servidor confirma meeting con tankSlot 1
    snap = {
      ...snap,
      meeting: {
        reporterId: 'me',
        tankSlot: 1,
        lastVisitors: [],
        votesCast: [],
        endsAtTick: 100,
        votingClosed: false,
        ejectedId: null,
        wasImpostor: false,
      },
    };

    actionKey.keyDown({ code: ACTION_KEY });
    expect(sent).toHaveLength(1);
  });

  it('ignores KeyC and other non-E keys', () => {
    const sent: ClientMessage[] = [];
    const snap = baseSnap([tank(1, 'p2', true)]);
    const me = player('me');
    const actionKey = new ActionKey(
      'me',
      () => me,
      () => snap,
      (msg) => sent.push(msg),
    );

    actionKey.keyDown({ code: 'KeyC' });
    expect(sent).toHaveLength(0);
  });

  it('triggers contaminate for impostor on KeyE', () => {
    const sent: ClientMessage[] = [];
    const snap: Snapshot = {
      ...baseSnap([tank(1, 'p2', false)]),
      myRole: 'IMPOSTOR',
    };
    const me = player('me');
    const actionKey = new ActionKey(
      'me',
      () => me,
      () => snap,
      (msg) => sent.push(msg),
    );

    actionKey.keyDown({ code: ACTION_KEY });
    expect(sent).toEqual([{ type: 'contaminate', tankSlot: 1 }]);
  });

  it('cancels pending contaminate on movement key', () => {
    const sent: ClientMessage[] = [];
    const snap: Snapshot = {
      ...baseSnap([tank(1, 'p2', false)]),
      myRole: 'IMPOSTOR',
    };
    const me = player('me');
    const actionKey = new ActionKey(
      'me',
      () => me,
      () => snap,
      (msg) => sent.push(msg),
    );

    actionKey.keyDown({ code: ACTION_KEY });
    expect(sent).toHaveLength(1);

    // Movimiento cancela
    actionKey.keyDown({ code: 'KeyW' });
    const ctx = {
      beginPath: () => {},
      arc: () => {},
      stroke: () => {},
      fillText: () => {},
      measureText: () => ({ width: 10 }),
      fillRect: () => {},
    } as unknown as CanvasRenderingContext2D;
    actionKey.render(ctx, {
      x: 0,
      y: 0,
      viewWidth: 800,
      viewHeight: 600,
    });
  });

  it('does nothing when player is dead', () => {
    const sent: ClientMessage[] = [];
    const snap = baseSnap([tank(1, 'p2', true)]);
    const me = player('me', false); // dead
    const actionKey = new ActionKey(
      'me',
      () => me,
      () => snap,
      (msg) => sent.push(msg),
    );

    actionKey.keyDown({ code: ACTION_KEY });
    expect(sent).toHaveLength(0);
  });
});
