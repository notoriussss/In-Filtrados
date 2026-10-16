// Carga de los assets del mapa Estación Manglar Verde
// (public/assets/map/manglar-verde, del paquete de diseño v3): el suelo,
// la luz de noche, los props con su atlas y los 11 niveles del tanque.

export const MAP_ASSETS_URL = '/assets/map/manglar-verde';

export type Frame = { x: number; y: number; w: number; h: number };

// Prop: un objeto del mapa que se ordena por profundidad con los
// jugadores (baseY), como árboles, mesas o máquinas.
export type Prop = {
  sprite: string;
  x: number;
  y: number;
  w: number;
  h: number;
  baseY: number;
};

export type MapAssets = {
  ground: HTMLImageElement;
  nightLight: HTMLImageElement;
  propsAtlas: HTMLImageElement;
  propFrames: Map<string, Frame>;
  props: Prop[];
  tanksAtlas: HTMLImageElement;
  // Nivel de agua limpia (0 a 100, de 10 en 10) → cuadro del atlas.
  tankFrames: Map<number, Frame>;
  minimap: HTMLImageElement;
};

type AtlasJson = {
  frames: (Frame & { id: string; level?: number })[];
};

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(url));
    img.src = url;
  });
}

async function loadJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url);
  return (await res.json()) as T;
}

let pending: Promise<MapAssets> | null = null;

// loadMapAssets descarga todo una sola vez; las demás llamadas reciben
// la misma promesa. onProgress va de 0 a 1 (pantalla de carga).
export function loadMapAssets(
  onProgress?: (done: number) => void,
): Promise<MapAssets> {
  if (!pending) {
    pending = load(onProgress).catch((err) => {
      pending = null; // que el próximo intento vuelva a descargar
      throw err;
    });
  }
  return pending;
}

async function load(onProgress?: (done: number) => void): Promise<MapAssets> {
  const base = MAP_ASSETS_URL;
  let done = 0;
  const total = 8;
  const step = <T>(p: Promise<T>) =>
    p.then((v) => {
      done++;
      onProgress?.(done / total);
      return v;
    });
  const [
    ground,
    nightLight,
    propsAtlas,
    propsAtlasJson,
    propsJson,
    tanksAtlas,
    tanksAtlasJson,
    minimap,
  ] = await Promise.all([
    step(loadImage(`${base}/ground.png`)),
    step(loadImage(`${base}/night-light.png`)),
    step(loadImage(`${base}/props-atlas.png`)),
    step(loadJson<AtlasJson>(`${base}/props-atlas.json`)),
    step(loadJson<{ props: Prop[] }>(`${base}/props.json`)),
    step(loadImage(`${base}/tanks-atlas.png`)),
    step(loadJson<AtlasJson>(`${base}/tanks-atlas.json`)),
    step(loadImage(`${base}/minimap.png`)),
  ]);
  const propFrames = new Map(
    propsAtlasJson.frames.map((f) => [f.id, f] as const),
  );
  const tankFrames = new Map(
    tanksAtlasJson.frames.map((f) => [f.level ?? 0, f] as const),
  );
  return {
    ground,
    nightLight,
    propsAtlas,
    propFrames,
    props: propsJson.props,
    tanksAtlas,
    tankFrames,
    minimap,
  };
}
