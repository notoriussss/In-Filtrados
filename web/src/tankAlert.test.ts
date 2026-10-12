import { describe, expect, it } from 'vitest';
import type { Snapshot, TankView } from '@in-filtrados/messages';
import { ownTankRose } from './tankAlert';

const snapWithTanks = (tanks: TankView[]): Snapshot => ({
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

describe('ownTankRose', () => {
  it('returns true when own tank contamination rises', () => {
    const prev = snapWithTanks([
      { slot: 0, ownerId: 'me', contamination: 0, dead: false },
    ]);
    const next = snapWithTanks([
      { slot: 0, ownerId: 'me', contamination: 35, dead: false },
    ]);
    expect(ownTankRose(prev, next, 'me')).toBe(true);
  });

  it('returns false when own tank contamination stays equal', () => {
    const prev = snapWithTanks([
      { slot: 0, ownerId: 'me', contamination: 35, dead: false },
    ]);
    const next = snapWithTanks([
      { slot: 0, ownerId: 'me', contamination: 35, dead: false },
    ]);
    expect(ownTankRose(prev, next, 'me')).toBe(false);
  });

  it('returns false when prev snapshot is null (e.g. reload or first)', () => {
    const next = snapWithTanks([
      { slot: 0, ownerId: 'me', contamination: 35, dead: false },
    ]);
    expect(ownTankRose(null, next, 'me')).toBe(false);
  });

  it('returns false when another player tank contamination rises', () => {
    const prev = snapWithTanks([
      { slot: 0, ownerId: 'me', contamination: 0, dead: false },
      { slot: 1, ownerId: 'other', contamination: 0, dead: false },
    ]);
    const next = snapWithTanks([
      { slot: 0, ownerId: 'me', contamination: 0, dead: false },
      { slot: 1, ownerId: 'other', contamination: 35, dead: false },
    ]);
    expect(ownTankRose(prev, next, 'me')).toBe(false);
  });

  it('returns false if player tank is not present', () => {
    const prev = snapWithTanks([]);
    const next = snapWithTanks([]);
    expect(ownTankRose(prev, next, 'me')).toBe(false);
  });

  it('returns false when own tank rises but player is impostor', () => {
    const prev = snapWithTanks([
      { slot: 0, ownerId: 'me', contamination: 0, dead: false },
    ]);
    const next: Snapshot = {
      ...snapWithTanks([
        { slot: 0, ownerId: 'me', contamination: 1, dead: false },
      ]),
      myRole: 'IMPOSTOR',
    };
    expect(ownTankRose(prev, next, 'me')).toBe(false);
  });
});
