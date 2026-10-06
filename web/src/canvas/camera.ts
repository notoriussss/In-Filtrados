// The camera is centered on a world point; 1 world unit = 1 CSS pixel.
export type Camera = {
  x: number;
  y: number;
  viewWidth: number;
  viewHeight: number;
};

type Bounds = { width: number; height: number };

export const CAMERA_SPEED = 400; // world units per second, only for testing with the arrows

export function createCamera(world: Bounds, viewWidth: number, viewHeight: number): Camera {
  return clampCamera({ x: world.width / 2, y: world.height / 2, viewWidth, viewHeight }, world);
}

export function worldToScreen(camera: Camera, x: number, y: number): { x: number; y: number } {
  return {
    x: x - camera.x + camera.viewWidth / 2,
    y: y - camera.y + camera.viewHeight / 2,
  };
}

// Keeps the view inside the world; on an axis where the view is bigger than the world, centers it.
export function clampCamera(camera: Camera, world: Bounds): Camera {
  return {
    ...camera,
    x: clampAxis(camera.x, camera.viewWidth, world.width),
    y: clampAxis(camera.y, camera.viewHeight, world.height),
  };
}

// dx and dy are the pressed direction (-1, 0 or 1); dt is in seconds.
export function moveCamera(camera: Camera, world: Bounds, dx: number, dy: number, dt: number): Camera {
  return clampCamera(
    { ...camera, x: camera.x + dx * CAMERA_SPEED * dt, y: camera.y + dy * CAMERA_SPEED * dt },
    world,
  );
}

function clampAxis(center: number, view: number, world: number): number {
  if (view >= world) return world / 2;
  return Math.min(Math.max(center, view / 2), world - view / 2);
}
