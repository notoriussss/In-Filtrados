import { describe, expect, it } from 'vitest';
import type { MyTask, PlayerView, TankView } from '@in-filtrados/messages';
import {
  HoldAction,
  actionMessage,
  contextAction,
  holdDuration,
  tankRose,
} from './actions';
import type { GameMap } from '../map';
import { ACTION_TEXT, GAME_RULES, HUD_TEXT } from '../constants';

const map: GameMap = {
  width: 1000,
  height: 1000,
  spawn: { x: 0, y: 0 },
  walls: [],
  zones: [],
  stations: [{ id: 'st-1', type: 'reduce', x: 800, y: 800 }],
  tanks: [
    { slot: 0, x: 100, y: 100 },
    { slot: 1, x: 400, y: 100 },
  ],
  fixPoints: [],
  markers: [{ id: 'reunion', name: 'Mesa de reuniones', x: 900, y: 900 }],
};

const player = (
  id: string,
  x: number,
  y: number,
  alive = true,
): PlayerView => ({
  id,
  name: id,
  color: '#fff',
  x,
  y,
  connected: true,
  alive,
  activity: null,
});

const tank = (
  slot: number,
  ownerId: string,
  contamination = 0,
  dead = false,
  reported = false,
): TankView => ({ slot, ownerId, contamination, dead, reported });

const tanks = [tank(0, 'impostor'), tank(1, 'crew')];

describe('contextAction', () => {
  it('offers Contaminar to the impostor next to a foreign tank', () => {
    const me = player('impostor', 410, 100);
    const a = contextAction(me, 'IMPOSTOR', tanks, map, 0, 0);
    expect(a?.kind).toBe('contaminate');
    expect(a?.label).toBe(ACTION_TEXT.CONTAMINATE);
    expect(a?.tankSlot).toBe(1);
    expect(actionMessage(a!)).toEqual({ type: 'contaminate', tankSlot: 1 });
  });

  it('never offers Contaminar to a crewmate', () => {
    const me = player('other', 410, 100);
    expect(contextAction(me, 'CREW', tanks, map, 0, 0)).toBeNull();
    const dirty = [tank(0, 'impostor'), tank(1, 'crew', 35)];
    expect(contextAction(me, 'CREW', dirty, map, 0, 0)).toBeNull();
  });

  it('never offers to clean a tank: the damage is permanent', () => {
    const dirty = [tank(0, 'impostor', 20), tank(1, 'crew', 50)];
    const crew = player('crew', 410, 100);
    expect(contextAction(crew, 'CREW', dirty, map, 0, 0)).toBeNull();
    const imp = player('impostor', 100, 110);
    expect(contextAction(imp, 'IMPOSTOR', dirty, map, 0, 0)).toBeNull();
  });

  it('does not let the impostor contaminate their own tank', () => {
    const me = player('impostor', 100, 110);
    expect(contextAction(me, 'IMPOSTOR', tanks, map, 0, 0)).toBeNull();
  });

  it('disables Contaminar while waiting', () => {
    const me = player('impostor', 400, 100);
    const a = contextAction(me, 'IMPOSTOR', tanks, map, 0, 4500);
    expect(a?.enabled).toBe(false);
    expect(a?.label).toBe(ACTION_TEXT.contaminateWait(5));
  });

  it('offers Reportar next to a dead tank, but not to ghosts', () => {
    const dead = [tank(0, 'impostor'), tank(1, 'crew', 100, true)];
    const alive = player('x', 450, 100);
    expect(contextAction(alive, 'CREW', dead, map, 0, 0)?.kind).toBe('report');
    const ghost = player('x', 450, 100, false);
    expect(contextAction(ghost, 'CREW', dead, map, 0, 0)).toBeNull();
  });

  it('does not offer Reportar again for a reported tank', () => {
    const dead = [tank(0, 'impostor'), tank(1, 'crew', 100, true)];
    const me = player('x', 450, 100);
    const reported = new Set([1]);
    expect(contextAction(me, 'CREW', dead, map, 0, 0, reported)).toBeNull();
  });

  it('does not offer Reportar for a tank the server marks reported', () => {
    const dead = [tank(0, 'impostor'), tank(1, 'crew', 100, true, true)];
    const me = player('x', 450, 100);
    expect(contextAction(me, 'CREW', dead, map, 0, 0)).toBeNull();
  });

  it('does not offer Reportar for a tank below one hundred', () => {
    const almost = [tank(0, 'impostor'), tank(1, 'crew', 99)];
    const me = player('x', 450, 100);
    expect(contextAction(me, 'CREW', almost, map, 0, 0)).toBeNull();
  });

  it('lets the impostor contaminate near a reported dead tank', () => {
    const local: GameMap = {
      ...map,
      tanks: [...map.tanks, { slot: 2, x: 450, y: 100 }],
    };
    const all = [
      tank(0, 'impostor'),
      tank(1, 'crew', 100, true),
      tank(2, 'other'),
    ];
    const me = player('impostor', 440, 100);
    const a = contextAction(me, 'IMPOSTOR', all, local, 0, 0, new Set([1]));
    expect(a?.kind).toBe('contaminate');
    expect(a?.tankSlot).toBe(2);
  });

  it('offers Hacer tarea next to a station, also to ghosts', () => {
    const me = player('x', 790, 800, false);
    const a = contextAction(me, 'CREW', tanks, map, 0, 0);
    expect(a?.kind).toBe('task');
    expect(actionMessage(a!)).toEqual({
      type: 'interact',
      stationId: 'st-1',
    });
  });

  it('offers Hacer tarea only for own pending stations', () => {
    const me = player('x', 790, 800);
    const pending: MyTask[] = [{ stationId: 'st-1', done: false }];
    const a = contextAction(me, 'CREW', tanks, map, 0, 0, new Set(), pending);
    expect(a?.kind).toBe('task');
    expect(a?.stationId).toBe('st-1');

    const done: MyTask[] = [{ stationId: 'st-1', done: true }];
    expect(
      contextAction(me, 'CREW', tanks, map, 0, 0, new Set(), done),
    ).toBeNull();

    const other: MyTask[] = [{ stationId: 'other-2', done: false }];
    expect(
      contextAction(me, 'CREW', tanks, map, 0, 0, new Set(), other),
    ).toBeNull();

    expect(
      contextAction(me, 'CREW', tanks, map, 0, 0, new Set(), []),
    ).toBeNull();
  });

  it('offers nothing far from everything', () => {
    const me = player('x', 600, 600);
    expect(contextAction(me, 'IMPOSTOR', tanks, map, 0, 0)).toBeNull();
  });

  it('offers Llamar reunión at the table while it is available', () => {
    const me = player('x', 900, 900);
    const meeting = { readyAtTick: 0, callsLeft: 2 };
    const a = contextAction(
      me,
      'CREW',
      tanks,
      map,
      0,
      0,
      new Set(),
      [],
      null,
      meeting,
      100,
    );
    expect(a?.kind).toBe('meeting');
    expect(a?.label).toBe(ACTION_TEXT.CALL_MEETING);
    expect(a?.enabled).toBe(true);
    expect(actionMessage(a!)).toEqual({ type: 'callMeeting' });
  });

  it('shows the meeting cooldown and the remaining uses', () => {
    const me = player('x', 900, 900);
    const waiting = contextAction(
      me,
      'CREW',
      tanks,
      map,
      0,
      0,
      new Set(),
      [],
      null,
      { readyAtTick: 1200, callsLeft: 2 },
      1000,
    );
    expect(waiting?.enabled).toBe(false);
    expect(waiting?.label).toBe(ACTION_TEXT.meetingWait(10));

    const none = contextAction(
      me,
      'CREW',
      tanks,
      map,
      0,
      0,
      new Set(),
      [],
      null,
      { readyAtTick: 0, callsLeft: 0 },
      1000,
    );
    expect(none?.enabled).toBe(false);
    expect(none?.label).toBe(ACTION_TEXT.NO_MEETINGS);
  });

  it('does not offer the meeting to ghosts or during an emergency', () => {
    const ghost = player('x', 900, 900, false);
    const meeting = { readyAtTick: 0, callsLeft: 2 };
    expect(
      contextAction(
        ghost,
        'CREW',
        tanks,
        map,
        0,
        0,
        new Set(),
        [],
        null,
        meeting,
        0,
      ),
    ).toBeNull();

    const alive = player('x', 900, 900);
    const emergency = {
      kind: 'steam' as const,
      endsAtTick: 1000,
      heldPoints: [],
    };
    expect(
      contextAction(
        alive,
        'CREW',
        tanks,
        map,
        0,
        0,
        new Set(),
        [],
        emergency,
        meeting,
        0,
      ),
    ).toBeNull();
  });
});

describe('HoldAction', () => {
  it('fills up over the action duration', () => {
    const me = player('impostor', 400, 100);
    const a = contextAction(me, 'IMPOSTOR', tanks, map, 0, 0)!;
    const hold = new HoldAction(a, 1000);
    expect(hold.progress(1000)).toBe(0);
    const half = 1000 + GAME_RULES.CONTAMINATE_MS / 2;
    expect(hold.progress(half)).toBe(0.5);
    expect(hold.done(1000 + GAME_RULES.CONTAMINATE_MS)).toBe(true);
    expect(hold.sameTarget(a)).toBe(true);
    expect(hold.sameTarget(null)).toBe(false);
  });
});

describe('tankRose', () => {
  it('warns when the tank is contaminated', () => {
    const next = [tank(0, 'impostor'), tank(1, 'crew', 35)];
    expect(tankRose(tanks, next, 'crew')).toBe(true);
    expect(tankRose(tanks, next, 'impostor')).toBe(false);
  });

  it('ignores the 1-point drift of the impostor tank', () => {
    const next = [tank(0, 'impostor', 1), tank(1, 'crew')];
    expect(tankRose(tanks, next, 'impostor')).toBe(false);
  });

  it('never warns when player is IMPOSTOR even if contamination rises', () => {
    const next = [tank(0, 'impostor', 35), tank(1, 'crew')];
    expect(tankRose(tanks, next, 'impostor', 'IMPOSTOR')).toBe(false);
  });

  it('returns false when tank is missing in previous or next', () => {
    expect(tankRose([], tanks, 'crew')).toBe(false);
    expect(tankRose(tanks, [], 'crew')).toBe(false);
  });

  it('ignores cleaning', () => {
    const before = [tank(1, 'crew', 35)];
    const after = [tank(1, 'crew', 20)];
    expect(tankRose(before, after, 'crew')).toBe(false);
  });
});

describe('holdDuration', () => {
  it('returns correct durations for each kind', () => {
    expect(holdDuration('contaminate')).toBe(GAME_RULES.CONTAMINATE_MS);
    expect(holdDuration('task')).toBe(GAME_RULES.TASK_MS);
    expect(holdDuration('report')).toBe(0);
  });
});

describe('HUD_TEXT', () => {
  it('formats reservoir percentage label correctly', () => {
    expect(HUD_TEXT.reservoir(0)).toBe('Embalse 0 %');
    expect(HUD_TEXT.reservoir(42)).toBe('Embalse 42 %');
    expect(HUD_TEXT.reservoir(100)).toBe('Embalse 100 %');
  });
});
