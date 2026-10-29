// Cámara del mundo: sigue a un punto y escala para que siempre se vean
// al menos VIEW_W × VIEW_H unidades (960 × 540, como el paquete de
// diseño v3: los personajes de 40 × 56 se ven a ×2 en 1920 × 1080).
export const VIEW_W = 960;
export const VIEW_H = 540;

export type Camera = {
  x: number; // centro de la vista en el mundo
  y: number;
  viewWidth: number; // tamaño de la pantalla en píxeles CSS
  viewHeight: number;
  zoom: number; // píxeles CSS por unidad del mundo
};

type Bounds = { width: number; height: number };

export function zoomFor(viewWidth: number, viewHeight: number): number {
  return Math.min(viewWidth / VIEW_W, viewHeight / VIEW_H);
}

export function createCamera(
  world: Bounds,
  viewWidth: number,
  viewHeight: number,
): Camera {
  return clampCamera(
    {
      x: world.width / 2,
      y: world.height / 2,
      viewWidth,
      viewHeight,
      zoom: zoomFor(viewWidth, viewHeight),
    },
    world,
  );
}

export function worldToScreen(
  camera: Camera,
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: (x - camera.x) * camera.zoom + camera.viewWidth / 2,
    y: (y - camera.y) * camera.zoom + camera.viewHeight / 2,
  };
}

// visibleRect: la parte del mundo que entra en la pantalla.
export function visibleRect(camera: Camera): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const w = camera.viewWidth / camera.zoom;
  const h = camera.viewHeight / camera.zoom;
  return { x: camera.x - w / 2, y: camera.y - h / 2, w, h };
}

// Mantiene la vista dentro del mundo; en un eje donde la vista es más
// grande que el mundo, lo centra.
export function clampCamera(camera: Camera, world: Bounds): Camera {
  return {
    ...camera,
    x: clampAxis(camera.x, camera.viewWidth / camera.zoom, world.width),
    y: clampAxis(camera.y, camera.viewHeight / camera.zoom, world.height),
  };
}

// applyWorldTransform deja el contexto dibujando en unidades del mundo.
export function applyWorldTransform(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  dpr: number,
): void {
  const k = camera.zoom * dpr;
  ctx.setTransform(
    k,
    0,
    0,
    k,
    dpr * (camera.viewWidth / 2) - camera.x * k,
    dpr * (camera.viewHeight / 2) - camera.y * k,
  );
}

function clampAxis(center: number, view: number, world: number): number {
  if (view >= world) return world / 2;
  return Math.min(Math.max(center, view / 2), world - view / 2);
}
