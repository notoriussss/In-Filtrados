import { motionIsReduced } from '../settings';
import { useEffect, useRef } from 'react';
import { loadImage } from '../game/render/assets';

// Personajes «gota» del paquete v3 para los menús (en la partida se usan
// los sprites de Jimena). Hojas de public/assets/characters/gota: celdas
// de 40 × 56, 18 columnas (frente, lado y espalda × idle0, idle1,
// walk0..3) y 2 filas (vivo y fantasma). El cuerpo es del color que
// asigna match y encima va la capa del accesorio.

const BASE = '/assets/characters/gota';
const CELL_W = 40;
const CELL_H = 56;
const VIEWS = ['front', 'side', 'back'] as const;
const POSES = ['idle0', 'idle1', 'walk0', 'walk1', 'walk2', 'walk3'];
// Busto para retratos (como PK.characterPortrait de las maquetas).
const PORTRAIT = { x: 3, y: 2, w: 34, h: 36 };

// Color de match → nombre y accesorio de su gota (como en las maquetas).
export const GOTA_ROSTER: Record<string, { name: string; accessory: string }> =
  {
    '#e6194b': { name: 'Rojo', accessory: 'cap' },
    '#3cb44b': { name: 'Verde', accessory: 'sprout' },
    '#ffe119': { name: 'Amarillo', accessory: 'headphones' },
    '#4363d8': { name: 'Azul', accessory: 'flower' },
    '#f58231': { name: 'Naranja', accessory: 'straw-hat' },
    '#911eb4': { name: 'Morado', accessory: 'glasses' },
    '#46f0f0': { name: 'Cian', accessory: 'diving-mask' },
    '#f032e6': { name: 'Rosa', accessory: 'scarf' },
  };

export const SERVER_COLORS = Object.keys(GOTA_ROSTER);

export function colorName(color: string): string {
  return GOTA_ROSTER[color.toLowerCase()]?.name ?? '';
}

const sheets = new Map<string, Promise<HTMLImageElement>>();

function sheet(url: string): Promise<HTMLImageElement> {
  let p = sheets.get(url);
  if (!p) {
    p = loadImage(url);
    sheets.set(url, p);
  }
  return p;
}

export type GotaProps = {
  color: string;
  scale?: number; // píxeles por píxel del sprite
  view?: (typeof VIEWS)[number];
  walk?: boolean;
  ghost?: boolean;
  portrait?: boolean; // solo el busto
  animate?: boolean; // respira (idle) o camina (walk)
  className?: string;
  flip?: boolean; // de lado mirando a la izquierda
};

export function Gota(props: GotaProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const scale = props.scale ?? 3;
  const crop = props.portrait ? PORTRAIT : { x: 0, y: 0, w: CELL_W, h: CELL_H };
  const color = props.color.toLowerCase();
  const accessory = GOTA_ROSTER[color]?.accessory;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const body = sheet(`${BASE}/bodies/${color.slice(1)}.png`);
    const acc = accessory
      ? sheet(`${BASE}/accessories/${accessory}.png`)
      : Promise.resolve(null);
    Promise.all([body, acc]).then(([b, a]) => {
      if (!alive) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      let frame = 0;
      const draw = () => {
        const poses = props.walk ? 4 : 2;
        const pose = POSES[(props.walk ? 2 : 0) + (frame % poses)];
        const col =
          VIEWS.indexOf(props.view ?? 'front') * POSES.length +
          POSES.indexOf(pose);
        const sx = col * CELL_W + crop.x;
        const sy = (props.ghost ? CELL_H : 0) + crop.y;
        ctx.clearRect(0, 0, crop.w, crop.h);
        ctx.drawImage(b, sx, sy, crop.w, crop.h, 0, 0, crop.w, crop.h);
        if (a) ctx.drawImage(a, sx, sy, crop.w, crop.h, 0, 0, crop.w, crop.h);
      };
      draw();
      if (props.animate && !motionIsReduced()) {
        timer = setInterval(
          () => {
            frame++;
            draw();
          },
          props.walk ? 125 : 500,
        );
      }
    });
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [
    color,
    accessory,
    props.walk,
    props.ghost,
    props.view,
    props.animate,
    crop.x,
    crop.y,
    crop.w,
    crop.h,
  ]);

  return (
    <canvas
      ref={ref}
      className={`px-sprite ${props.className ?? ''}`}
      width={crop.w}
      height={crop.h}
      style={{
        width: crop.w * scale,
        height: crop.h * scale,
        opacity: props.ghost ? 0.7 : 1,
        transform: props.flip ? 'scaleX(-1)' : undefined,
      }}
    />
  );
}
