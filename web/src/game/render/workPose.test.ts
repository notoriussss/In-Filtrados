import type { Activity } from '@in-filtrados/messages';
import { describe, expect, it } from 'vitest';
import { FLOURISH_MS, IDLE_POSE, flourishPose, workPose } from './workPose';

const ACTIVITIES: Activity[] = ['reduce', 'reuse', 'recycle', 'tank', 'fix'];

describe('workPose', () => {
  it('starts from the idle pose and ramps into the rhythm', () => {
    for (const a of ACTIVITIES) {
      const start = workPose(a, 1234, 0);
      expect(start.frame).toBe('front');
      expect(start.lean).toBe(0);
      expect(start.sy).toBe(1);
    }
  });

  it('keeps every pose within a believable range', () => {
    for (const a of ACTIVITIES) {
      for (let t = 0; t < 6000; t += 17) {
        const p = workPose(a, t, 1);
        expect(Math.abs(p.lean)).toBeLessThanOrEqual(6);
        expect(p.sx).toBeGreaterThan(0.85);
        expect(p.sx).toBeLessThan(1.2);
        expect(p.sy).toBeGreaterThan(0.8);
        expect(p.sy).toBeLessThan(1.2);
        expect(p.dy).toBeGreaterThanOrEqual(-6);
        expect(p.dy).toBeLessThanOrEqual(3);
        expect(p.strain).toBeGreaterThanOrEqual(0);
        expect(p.strain).toBeLessThanOrEqual(1);
      }
    }
  });

  it('cranks the valve: reaches forward, then tucks back', () => {
    const push = workPose('reduce', 180 * (Math.PI / 2), 1);
    const pull = workPose('reduce', 180 * ((3 * Math.PI) / 2), 1);
    expect(push.frame).toBe('right-walking1');
    expect(push.lean).toBeGreaterThan(2);
    expect(pull.frame).toBe('right-passing1');
    expect(pull.lean).toBeLessThan(-2);
  });

  it('hops while filtering: airborne, then squashed with dust on landing', () => {
    const air = workPose('recycle', 350, 1);
    expect(air.dy).toBeLessThan(-3);
    expect(air.sy).toBeGreaterThan(1);
    expect(air.shadow).toBeLessThan(1);
    const land = workPose('recycle', 700, 1);
    expect(land.sy).toBeLessThan(1);
    expect(land.dust).not.toBeNull();
  });

  it('winds up, strikes and rebounds with the hammer', () => {
    const windUp = workPose('fix', 150, 1);
    const strike = workPose('fix', 405, 1);
    const rebound = workPose('fix', 480, 1);
    expect(windUp.lean).toBeLessThan(0);
    expect(windUp.hit).toBe(false);
    expect(strike.hit).toBe(true);
    expect(strike.lean).toBeGreaterThan(0);
    expect(strike.sy).toBeLessThan(1);
    expect(rebound.hit).toBe(false);
  });

  it('looks the same when cleaning or contaminating a tank', () => {
    // El navegador no sabe cuál de las dos es: solo recibe 'tank'.
    expect(workPose('tank', 900, 1)).toEqual(workPose('tank', 900, 1));
  });
});

describe('flourishPose', () => {
  it('crouches, jumps and lands back on the ground', () => {
    const crouch = flourishPose(0);
    const jump = flourishPose(0.42);
    const end = flourishPose(1);
    expect(crouch.sy).toBeLessThan(1);
    expect(jump.dy).toBeLessThan(-5);
    expect(jump.frame).toBe('right-walking1');
    expect(end.dy).toBeCloseTo(0);
    expect(end.sy).toBeCloseTo(1);
  });

  it('raises dust after landing', () => {
    expect(flourishPose(0.5).dust).toBeNull();
    expect(flourishPose(0.85).dust).not.toBeNull();
    expect(FLOURISH_MS).toBeGreaterThan(300);
  });
});

describe('IDLE_POSE', () => {
  it('has no movement', () => {
    expect(IDLE_POSE.dx).toBe(0);
    expect(IDLE_POSE.dy).toBe(0);
    expect(IDLE_POSE.dust).toBeNull();
  });
});
