import { motionIsReduced } from '../settings';
import { useEffect, useRef } from 'react';
import { loadImage } from '../game/render/assets';
import { SPRITE_COLORS, SPRITE_H, SPRITE_W } from '../game/render/sprites';
import { SKIN_JIMENA, type Skin } from '../shop';

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

export const ACCESSORIES: { id: string; name: string }[] = [
  { id: 'cap', name: 'Gorra' },
  { id: 'sprout', name: 'Brote' },
  { id: 'headphones', name: 'Audífonos' },
  { id: 'glasses', name: 'Lentes' },
  { id: 'straw-hat', name: 'Sombrero de paja' },
  { id: 'diving-mask', name: 'Máscara buceo' },
  { id: 'scarf', name: 'Bufanda' },
  { id: 'backpack', name: 'Mochila' },
  { id: 'helmet', name: 'Casco' },
  { id: 'flower', name: 'Flor' },
  { id: 'fisher-hat', name: 'Pescador' },
  { id: 'raincoat', name: 'Impermeable' },
];

export function accessoryName(id: string): string {
  const found = ACCESSORIES.find((a) => a.id === id.toLowerCase());
  return found?.name ?? id;
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

// Cuadros de Jimena para cada vista (de lado mira a la derecha, igual
// que la hoja de la gota; flip la voltea).
const JIMENA_URL = '/assets/characters/jimena';
const JIMENA_FRAMES = {
  front: { idle: ['front'], walk: ['front-walking1', 'front-walking2'] },
  side: {
    idle: ['right-walking1'],
    walk: ['right-walking1', 'right-passing1', 'right-walking2'],
  },
  back: { idle: ['back'], walk: ['back-walking1', 'back-walking2'] },
} as const;
// El cuadro de Jimena se dibuja al doble de resolución que el de la
// gota para no perder detalle (88 × 125 contra 40 × 56).
const JIMENA_RES = 2;

export type GotaProps = {
  color: string;
  accessory?: string;
  // Qué personaje dibujar. Sin él se dibuja la gota con el accesorio de
  // su color (menús de adorno); en partida siempre se pasa.
  skin?: Skin;
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
  const crop = props.portrait
    ? PORTRAIT
    : { x: 0, y: 0, w: CELL_W, h: CELL_H };
  const color = props.color.toLowerCase();
  const jimena = props.skin === SKIN_JIMENA;
  const res = jimena ? JIMENA_RES : 1;
  const rawAccessory =
    props.accessory !== undefined && props.accessory !== ''
      ? props.accessory
      : props.skin === undefined
        ? GOTA_ROSTER[color]?.accessory
        : undefined;
  const accessory = rawAccessory?.toLowerCase();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    if (jimena) {
      const name = SPRITE_COLORS[color];
      const frames = JIMENA_FRAMES[props.view ?? 'front'];
      const names = props.walk ? frames.walk : frames.idle;
      if (!name) return;
      Promise.all(
        names.map((f) => sheet(`${JIMENA_URL}/${name}_Player-${f}.png`)),
      ).then((imgs) => {
        if (!alive) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        let frame = 0;
        const draw = () => {
          const img = imgs[frame % imgs.length];
          // El recorte de la gota (en celdas de 40 × 56) en el cuadro.
          const kx = SPRITE_W / CELL_W;
          const ky = SPRITE_H / CELL_H;
          ctx.clearRect(0, 0, crop.w * res, crop.h * res);
          ctx.drawImage(
            img,
            crop.x * kx,
            crop.y * ky,
            crop.w * kx,
            crop.h * ky,
            0,
            0,
            crop.w * res,
            crop.h * res,
          );
        };
        draw();
        if (props.animate && !motionIsReduced() && imgs.length > 1) {
          timer = setInterval(() => {
            frame++;
            draw();
          }, 220);
        }
      });
      return () => {
        alive = false;
        clearInterval(timer);
      };
    }
    const body = sheet(`${BASE}/bodies/${color.slice(1)}.png`);
    const acc =
      accessory && accessory !== 'none'
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
    jimena,
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
      width={crop.w * res}
      height={crop.h * res}
      style={{
        width: crop.w * scale,
        height: crop.h * scale,
        opacity: props.ghost ? 0.7 : 1,
        transform: props.flip ? 'scaleX(-1)' : undefined,
      }}
    />
  );
}
