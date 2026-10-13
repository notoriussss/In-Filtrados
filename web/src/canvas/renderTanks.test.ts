import { describe, expect, it } from 'vitest';
import type { PlayerView, TankView } from '@in-filtrados/messages';
import type { GameMap } from '../map';
import {
  renderHoldProgress,
  renderTanks,
  tankColor,
} from './renderTanks';

const map: GameMap = {
  width: 1000,
  height: 1000,
  spawn: { x: 0, y: 0 },
  walls: [],
  zones: [],
  stations: [],
  tanks: [
    { slot: 0, x: 100, y: 100 },
    { slot: 1, x: 300, y: 100 },
    { slot: 2, x: 500, y: 100 },
  ],
};

function createMockCtx(): CanvasRenderingContext2D {
  return {
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    fillText: () => {},
    strokeText: () => {},
    moveTo: () => {},
    quadraticCurveTo: () => {},
    ellipse: () => {},
  } as unknown as CanvasRenderingContext2D;
}

describe('tankColor', () => {
  it('is green for a clean tank', () => {
    expect(tankColor(0)).toBe('rgb(106, 168, 79)');
  });

  it('is brown for a full tank', () => {
    expect(tankColor(100)).toBe('rgb(122, 74, 30)');
  });

  it('clamps values out of range', () => {
    expect(tankColor(-5)).toBe(tankColor(0));
    expect(tankColor(150)).toBe(tankColor(100));
  });
});

describe('renderTanks', () => {
  it('renders alive and dead tanks without errors', () => {
    const tanks: TankView[] = [
      { slot: 0, ownerId: 'p1', contamination: 35, dead: false },
      { slot: 1, ownerId: 'p2', contamination: 100, dead: true },
      { slot: 2, ownerId: 'p3', contamination: 50, dead: false },
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
    const ctx = createMockCtx();
    const camera = {
      x: 100,
      y: 100,
      viewWidth: 800,
      viewHeight: 600,
    };

    expect(() => {
      renderTanks(ctx, tanks, players, map, camera);
    }).not.toThrow();
  });
});

describe('renderHoldProgress', () => {
  it('renders hold progress ring without errors', () => {
    const ctx = createMockCtx();
    const camera = {
      x: 0,
      y: 0,
      viewWidth: 800,
      viewHeight: 600,
    };

    expect(() => {
      renderHoldProgress(ctx, camera, 50, 50, 0.5);
    }).not.toThrow();
  });
});
