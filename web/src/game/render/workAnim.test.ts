import type { Activity, PlayerView } from '@in-filtrados/messages';
import { describe, expect, it } from 'vitest';
import { MIN_WORK_MS, PlayerAnimator } from './playerAnim';
import { FLOURISH_MS } from './workPose';

function player(over: Partial<PlayerView> = {}): PlayerView {
  return {
    id: 'p1',
    name: 'Ana',
    color: '#e6194b',
    x: 100,
    y: 100,
    connected: true,
    alive: true,
    activity: null,
    ...over,
  };
}

// run avanza al jugador cuadro a cuadro (cada 16 ms) y devuelve la última
// pose, como lo haría el renderer.
function run(anim: PlayerAnimator, p: PlayerView, from: number, to: number) {
  let pose = anim.pose(p, from);
  for (let t = from + 16; t <= to; t += 16) pose = anim.pose(p, t);
  return pose;
}

describe('PlayerAnimator work poses', () => {
  it('shows a work pose while the player does a task', () => {
    const anim = new PlayerAnimator();
    const p = player({ activity: 'reduce' as Activity });
    const pose = run(anim, p, 0, 800);
    expect(pose.working).toBe('reduce');
    expect(pose.walking).toBe(false);
    expect(['right-walking1', 'right-passing1']).toContain(pose.frame);
    expect(pose.body.lean).not.toBe(0);
  });

  it('stays idle without an activity', () => {
    const anim = new PlayerAnimator();
    const pose = run(anim, player(), 0, 800);
    expect(pose.working).toBeNull();
    expect(pose.frame).toBe('front');
    expect(pose.celebrate).toBeNull();
  });

  it('celebrates after a finished task, then goes back to idle', () => {
    const anim = new PlayerAnimator();
    const working = player({ activity: 'recycle' });
    run(anim, working, 0, MIN_WORK_MS + 400);
    const idle = player();
    const start = MIN_WORK_MS + 416;
    let celebrated = false;
    for (let t = start; t < start + 600; t += 16) {
      if (anim.pose(idle, t).celebrate !== null) celebrated = true;
    }
    expect(celebrated).toBe(true);
    const after = run(anim, idle, start + 600, start + 600 + FLOURISH_MS);
    expect(after.celebrate).toBeNull();
    expect(after.body.dy).toBe(0);
  });

  it('does not celebrate a task that was cut short', () => {
    const anim = new PlayerAnimator();
    run(anim, player({ activity: 'fix' }), 0, 500);
    const idle = player();
    for (let t = 516; t < 1800; t += 16) {
      expect(anim.pose(idle, t).celebrate).toBeNull();
    }
  });

  it('ignores a one-snapshot blink of the activity', () => {
    const anim = new PlayerAnimator();
    const working = player({ activity: 'reuse' });
    run(anim, working, 0, 2000);
    anim.pose(player(), 2016);
    const pose = anim.pose(working, 2032);
    expect(pose.working).toBe('reuse');
    expect(pose.celebrate).toBeNull();
  });

  it('walks instead of working when the player moves', () => {
    const anim = new PlayerAnimator();
    anim.pose(player({ activity: 'reduce' }), 0);
    const moving = player({ activity: 'reduce', x: 130 });
    const pose = anim.pose(moving, 100);
    expect(pose.walking).toBe(true);
    expect(pose.working).toBeNull();
  });
});
