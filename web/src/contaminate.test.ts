import { describe, expect, it } from 'vitest';
import type { TankView } from '@in-filtrados/messages';
import { TANK_RANGE, pickTank } from './contaminate';

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

describe('pickTank', () => {
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
