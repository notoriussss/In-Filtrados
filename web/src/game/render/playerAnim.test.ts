import type { PlayerView } from '@in-filtrados/messages';
import { describe, expect, it } from 'vitest';
import { PlayerAnimator, STEP_MS, VERTICAL_STEP_MS } from './playerAnim';

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
