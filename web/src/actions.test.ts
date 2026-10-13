import { describe, expect, it } from 'vitest';
import type { PlayerView, TankView } from '@in-filtrados/messages';
import {
  HoldAction,
  actionMessage,
  contextAction,
  tankRose,
} from './actions';
import type { GameMap } from './map';
import { ACTION_TEXT, GAME_RULES } from './constants';

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
});

const tank = (
  slot: number,
  ownerId: string,
  contamination = 0,
  dead = false,
): TankView => ({ slot, ownerId, contamination, dead });

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
    expect(contextAction(me, 'CREW', dirty, map, 0, 0)?.kind).toBe('clean');
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
    expect(contextAction(alive, 'CREW', dead, map, 0, 0)?.kind).toBe(
      'report',
    );
    const ghost = player('x', 450, 100, false);
    expect(contextAction(ghost, 'CREW', dead, map, 0, 0)).toBeNull();
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

  it('offers nothing far from everything', () => {
    const me = player('x', 600, 600);
    expect(contextAction(me, 'IMPOSTOR', tanks, map, 0, 0)).toBeNull();
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

  it('ignores cleaning', () => {
    const before = [tank(1, 'crew', 35)];
    const after = [tank(1, 'crew', 20)];
    expect(tankRose(before, after, 'crew')).toBe(false);
  });
});
