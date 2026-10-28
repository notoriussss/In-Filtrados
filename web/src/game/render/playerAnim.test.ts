import type { PlayerView } from '@in-filtrados/messages';
import { describe, expect, it } from 'vitest';
import {
  ASCEND_MS,
  PlayerAnimator,
  STEP_MS,
  VERTICAL_STEP_MS,
  gotaCell,
} from './playerAnim';

// Cada cuadro mueve 5 unidades en 5 ms (1000 u/s, por encima de
// MOVING_SPEED), más fino que STEP_MS para no saltarse cuadros.
const FRAME_MS = 5;
const STEP = 5;

function at(x: number, y: number): PlayerView {
  return { id: 'p1', x, y } as PlayerView;
}

// walk mueve al jugador n cuadros en (dx, dy) y devuelve cada pose.
function walk(
  anim: PlayerAnimator,
  from: { x: number; y: number; t: number },
  dx: number,
  dy: number,
  n: number,
) {
  const poses = [];
  for (let i = 0; i < n; i++) {
    from.x += dx * STEP;
    from.y += dy * STEP;
    from.t += FRAME_MS;
    poses.push(anim.pose(at(from.x, from.y), from.t));
  }
  return poses;
}

function start(anim: PlayerAnimator) {
  const pos = { x: 100, y: 100, t: 0 };
  anim.pose(at(pos.x, pos.y), pos.t);
  return pos;
}

describe('PlayerAnimator', () => {
  it('stands facing front when still', () => {
    const anim = new PlayerAnimator();
    const pos = start(anim);
    const pose = anim.pose(at(pos.x, pos.y), 500);
    expect(pose).toMatchObject({ frame: 'front', walking: false });
  });

  // distinct devuelve los cuadros en orden, sin repetir seguidos.
  function distinct(frames: string[]): string[] {
    return frames.filter((f, i) => i === 0 || frames[i - 1] !== f);
  }

  it('cycles the four right frames while walking right', () => {
    const anim = new PlayerAnimator();
    const pos = start(anim);
    const n = Math.ceil((STEP_MS * 4) / FRAME_MS);
    const frames = walk(anim, pos, 1, 0, n).map((p) => p.frame);
    expect(distinct(frames)).toEqual([
      'right-walking1',
      'right-passing1',
      'right-walking2',
      'right-passing2',
    ]);
  });

  it('cycles the four left frames while walking left', () => {
    const anim = new PlayerAnimator();
    const pos = start(anim);
    const n = Math.ceil((STEP_MS * 4) / FRAME_MS);
    const frames = walk(anim, pos, -1, 0, n).map((p) => p.frame);
    expect(distinct(frames)).toEqual([
      'left-walking1',
      'left-passing1',
      'left-walking2',
      'left-passing2',
    ]);
  });

  it('cycles the back frames while walking up', () => {
    const anim = new PlayerAnimator();
    const pos = start(anim);
    const n = Math.ceil((VERTICAL_STEP_MS * 4) / FRAME_MS);
    const frames = walk(anim, pos, 0, -1, n).map((p) => p.frame);
    expect(distinct(frames)).toEqual([
      'back-walking1',
      'back',
      'back-walking2',
      'back',
    ]);
  });

  it('cycles the front frames while walking down', () => {
    const anim = new PlayerAnimator();
    const pos = start(anim);
    const n = Math.ceil((VERTICAL_STEP_MS * 4) / FRAME_MS);
    const frames = walk(anim, pos, 0, 1, n).map((p) => p.frame);
    expect(distinct(frames)).toEqual([
      'front-walking1',
      'front',
      'front-walking2',
      'front',
    ]);
  });

  it('leaves the back pose when walking sideways again', () => {
    const anim = new PlayerAnimator();
    const pos = start(anim);
    walk(anim, pos, 0, -1, 3);
    const [pose] = walk(anim, pos, -1, 0, 1);
    expect(pose.frame).toMatch(/^left-walking/);
  });

  it('walks sideways when mostly horizontal going up', () => {
    const anim = new PlayerAnimator();
    const pos = start(anim);
    const [pose] = walk(anim, pos, 1, -0.5, 1);
    expect(pose.frame).toMatch(/^right-walking/);
  });

  it('goes back to front after stopping', () => {
    const anim = new PlayerAnimator();
    const pos = start(anim);
    walk(anim, pos, 0, -1, 3);
    const pose = anim.pose(at(pos.x, pos.y), pos.t + 1000);
    expect(pose.frame).toBe('front');
  });
});

describe('gotaCell', () => {
  it('maps walking directions to expected columns and flip states', () => {
    const basePose = {
      frame: 'front' as const,
      walking: true,
      body: {
        frame: 'front' as const,
        dx: 0,
        dy: 0,
        lean: 0,
        sx: 1,
        sy: 1,
        shadow: 1,
        strain: 0,
        dust: null,
        hit: false,
      },
      working: null,
      celebrate: null,
    };

    expect(gotaCell({ ...basePose, heading: 'down', stepIndex: 0 }, 0)).toEqual(
      { col: 2, flip: false },
    );
    expect(gotaCell({ ...basePose, heading: 'down', stepIndex: 3 }, 0)).toEqual(
      { col: 5, flip: false },
    );
    expect(gotaCell({ ...basePose, heading: 'up', stepIndex: 1 }, 0)).toEqual(
      { col: 15, flip: false },
    );
    expect(
      gotaCell({ ...basePose, heading: 'right', stepIndex: 2 }, 0),
    ).toEqual({ col: 10, flip: false });
    expect(gotaCell({ ...basePose, heading: 'left', stepIndex: 2 }, 0)).toEqual(
      { col: 10, flip: true },
    );
  });

  it('maps idle directions to breathing idle frames and proper flip', () => {
    const idlePose = {
      frame: 'front' as const,
      walking: false,
      body: {
        frame: 'front' as const,
        dx: 0,
        dy: 0,
        lean: 0,
        sx: 1,
        sy: 1,
        shadow: 1,
        strain: 0,
        dust: null,
        hit: false,
      },
      working: null,
      celebrate: null,
    };

    expect(gotaCell({ ...idlePose, heading: 'down' }, 0)).toEqual({
      col: 0,
      flip: false,
    });
    expect(gotaCell({ ...idlePose, heading: 'down' }, 500)).toEqual({
      col: 1,
      flip: false,
    });
    expect(gotaCell({ ...idlePose, heading: 'up' }, 0)).toEqual({
      col: 12,
      flip: false,
    });
    expect(gotaCell({ ...idlePose, heading: 'left' }, 0)).toEqual({
      col: 6,
      flip: true,
    });
    expect(gotaCell({ ...idlePose, heading: 'right' }, 0)).toEqual({
      col: 6,
      flip: false,
    });
  });
});

describe('PlayerAnimator, paso a fantasma', () => {
  const body = (alive: boolean) =>
    ({ id: 'p1', x: 100, y: 100, alive }) as PlayerView;

  it('does not animate someone who stays alive', () => {
    const anim = new PlayerAnimator();
    expect(anim.pose(body(true), 0).ascend).toBeNull();
    expect(anim.pose(body(true), 500).ascend).toBeNull();
  });

  it('starts at 0 when a living player dies and runs for ASCEND_MS', () => {
    const anim = new PlayerAnimator();
    anim.pose(body(true), 0);
    expect(anim.pose(body(false), 1000).ascend).toBe(0);
    const half = anim.pose(body(false), 1000 + ASCEND_MS / 2).ascend;
    expect(half).toBeCloseTo(0.5, 2);
    expect(anim.pose(body(false), 1000 + ASCEND_MS - 1).ascend).toBeLessThan(1);
    expect(anim.pose(body(false), 1000 + ASCEND_MS).ascend).toBeNull();
    // Ya es fantasma de siempre: no se repite.
    expect(anim.pose(body(false), 1000 + ASCEND_MS + 500).ascend).toBeNull();
  });

  it('does not animate someone first seen already dead', () => {
    const anim = new PlayerAnimator();
    expect(anim.pose(body(false), 0).ascend).toBeNull();
    expect(anim.pose(body(false), 300).ascend).toBeNull();
  });
});
