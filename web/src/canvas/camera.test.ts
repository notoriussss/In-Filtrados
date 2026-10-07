import { describe, expect, it } from 'vitest';
import { CAMERA_SPEED, clampCamera, createCamera, moveCamera, worldToScreen } from './camera';

const world = { width: 1600, height: 1200 };

describe('camera', () => {
  it('starts centered on the map', () => {
    const camera = createCamera(world, 800, 600);
    expect(camera).toMatchObject({ x: 800, y: 600 });
  });

  it('maps the camera center to the center of the screen', () => {
    const camera = createCamera(world, 800, 600);
    expect(worldToScreen(camera, 800, 600)).toEqual({ x: 400, y: 300 });
    expect(worldToScreen(camera, 400, 300)).toEqual({ x: 0, y: 0 });
  });

  it('moves with the direction and elapsed time', () => {
    const camera = createCamera(world, 800, 600);
    const moved = moveCamera(camera, world, 1, -1, 0.5);
    expect(moved.x).toBe(800 + CAMERA_SPEED * 0.5);
    expect(moved.y).toBe(600 - CAMERA_SPEED * 0.5);
  });

  it('does not show beyond the edges of the world', () => {
    const camera = createCamera(world, 800, 600);
    const moved = moveCamera(camera, world, -1, 1, 10);
    expect(moved).toMatchObject({ x: 400, y: 900 });
  });

  it('centers an axis when the view is bigger than the world', () => {
    const camera = clampCamera({ x: 0, y: 0, viewWidth: 2000, viewHeight: 600 }, world);
    expect(camera).toMatchObject({ x: 800, y: 300 });
  });
});
