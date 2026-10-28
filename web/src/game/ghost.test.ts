import type { PlayerView, Snapshot, TankView } from '@in-filtrados/messages';
import { describe, expect, it } from 'vitest';
import { ownTankEmptied } from './ghost';

const player = (id: string, alive: boolean) => ({ id, alive }) as PlayerView;
const tank = (ownerId: string, dead: boolean) =>
  ({ slot: 0, ownerId, contamination: dead ? 100 : 40, dead }) as TankView;

const snap = (players: PlayerView[], tanks: TankView[]) =>
  ({ players, tanks }) as Snapshot;

describe('ownTankEmptied', () => {
  const alive = snap([player('me', true)], [tank('me', false)]);

  it('fires when my tank dies and I become a ghost', () => {
    const next = snap([player('me', false)], [tank('me', true)]);
    expect(ownTankEmptied(alive, next, 'me')).toBe(true);
  });

  it('does not fire when I was voted out with a healthy tank', () => {
    const next = snap([player('me', false)], [tank('me', false)]);
    expect(ownTankEmptied(alive, next, 'me')).toBe(false);
  });

  it('fires once: not while I stay a ghost', () => {
    const ghost = snap([player('me', false)], [tank('me', true)]);
    expect(ownTankEmptied(ghost, ghost, 'me')).toBe(false);
  });

  it('ignores other players and a missing first snapshot', () => {
    const other = snap(
      [player('me', true), player('x', false)],
      [tank('me', false), tank('x', true)],
    );
    expect(ownTankEmptied(alive, other, 'me')).toBe(false);
    expect(ownTankEmptied(null, other, 'me')).toBe(false);
  });
});
