import { describe, expect, it } from 'vitest';
import {
  clampCamera,
  createCamera,
  visibleRect,
  worldToScreen,
  zoomFor,
} from './camera';

const world = { width: 2752, height: 1824 };

describe('camera', () => {
  it('shows at least 960 x 540 world units', () => {
    expect(zoomFor(1920, 1080)).toBe(2);
    expect(zoomFor(1280, 1080)).toBeCloseTo(1280 / 960);
    const cam = createCamera(world, 1920, 1080);
    expect(visibleRect(cam)).toMatchObject({ w: 960, h: 540 });
  });

  it('maps the camera center to the center of the screen', () => {
    const cam = { x: 1000, y: 800, viewWidth: 1920, viewHeight: 1080, zoom: 2 };
    expect(worldToScreen(cam, 1000, 800)).toEqual({ x: 960, y: 540 });
    expect(worldToScreen(cam, 520, 530)).toEqual({ x: 0, y: 0 });
  });

  it('does not show beyond the edges of the world', () => {
    const cam = clampCamera(
      { x: 0, y: 5000, viewWidth: 1920, viewHeight: 1080, zoom: 2 },
      world,
    );
    expect(cam).toMatchObject({ x: 480, y: 1824 - 270 });
  });

  it('centers an axis when the view is bigger than the world', () => {
    const cam = clampCamera(
      { x: 0, y: 0, viewWidth: 4000, viewHeight: 1080, zoom: 1 },
      world,
    );
    expect(cam).toMatchObject({ x: 1376, y: 540 });
  });
});
