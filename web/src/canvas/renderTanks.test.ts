import { describe, expect, it } from 'vitest';
import type { PlayerView, TankView } from '@in-filtrados/messages';
import { renderTanks, tankColor } from './renderTanks';

describe('tankColor', () => {
  it('returns clean green at 0 contamination', () => {
    expect(tankColor(0)).toBe('rgb(76, 175, 80)');
  });

  it('returns dirty brown at 100 contamination', () => {
    expect(tankColor(100)).toBe('rgb(121, 85, 72)');
  });

  it('clamps values below 0 to clean green', () => {
    expect(tankColor(-5)).toBe('rgb(76, 175, 80)');
  });

  it('clamps values above 100 to dirty brown', () => {
    expect(tankColor(150)).toBe('rgb(121, 85, 72)');
  });

  it('interpolates intermediate values', () => {
    // 50%: (76+121)/2 = 98.5 -> 99, (175+85)/2 = 130, (80+72)/2 = 76
    expect(tankColor(50)).toBe('rgb(99, 130, 76)');
  });
});

describe('renderTanks', () => {
  it('renders alive and dead tanks without errors', () => {
    const tanks: TankView[] = [
      { slot: 0, ownerId: 'p1', contamination: 35, dead: false },
      { slot: 1, ownerId: 'p2', contamination: 100, dead: true },
    ];
    const spots = [
      { slot: 0, x: 100, y: 100 },
      { slot: 1, x: 200, y: 100 },
    ];
    const players: PlayerView[] = [
      {
        id: 'p1',
        name: 'Player 1',
        color: '#ff0000',
        x: 0,
        y: 0,
        connected: true,
        alive: true,
      },
    ];
    const ctx = {
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      fillText: () => {},
      strokeText: () => {},
    } as unknown as CanvasRenderingContext2D;

    renderTanks(ctx, tanks, spots, players, {
      x: 100,
      y: 100,
      viewWidth: 800,
      viewHeight: 600,
    });
  });
});
