import { motionIsReduced } from '../settings';
import { useEffect, useRef } from 'react';
import { loadImage } from '../game/render/assets';
import {
  ACCESSORY_CELL_H,
  ACCESSORY_CELL_W,
  SPRITE_W,
  accessoryCell,
  jimenaBakedUrl,
} from '../game/render/sprites';
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
// Busto para retratos de la gota clásica
const PORTRAIT = { x: 2, y: 0, w: 36, h: 38 };

// Busto uniforme para retratos de Jimena: encuadre que contiene cabeza,
// hombros y cualquier accesorio (brote, sombrero, gafas) sin cortes.
const JIMENA_PORTRAIT = { x: 8, y: 6, w: 120, h: 108 };
const JIMENA_FULL = {
  x: 0,
  y: 0,
  w: ACCESSORY_CELL_W,
  h: ACCESSORY_CELL_H,
};

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

export function normalizeColor(raw?: string): string {
  if (!raw) return SERVER_COLORS[0];
  const c = raw.trim().toLowerCase();
  if (c.startsWith('#')) return c;
  if (/^[0-9a-f]{6}$/i.test(c)) return `#${c}`;
  const map: Record<string, string> = {
    red: '#e6194b',
    rojo: '#e6194b',
    green: '#3cb44b',
    verde: '#3cb44b',
    yellow: '#ffe119',
    amarillo: '#ffe119',
    blue: '#4363d8',
    azul: '#4363d8',
    orange: '#f58231',
    naranja: '#f58231',
    purple: '#911eb4',
    morado: '#911eb4',
    cyan: '#46f0f0',
    cian: '#46f0f0',
    magenta: '#f032e6',
    rosa: '#f032e6',
    pink: '#f032e6',
  };
  return map[c] ?? SERVER_COLORS[0];
}

export function colorName(color: string): string {
  return GOTA_ROSTER[normalizeColor(color)]?.name ?? '';
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
const JIMENA_FRAMES = {
  front: { idle: ['front'], walk: ['front-walking1', 'front-walking2'] },
  side: {
    idle: ['right-walking1'],
    walk: ['right-walking1', 'right-passing1', 'right-walking2'],
  },
  back: { idle: ['back'], walk: ['back-walking1', 'back-walking2'] },
} as const;
// Medidas de la gota (celdas de 40 × 56) pasadas a píxeles del cuadro de
// Jimena (88 × 125). Su lienzo se dibuja en esos píxeles, sin remuestrear,
// y el navegador lo amplía sin suavizado: así no se borronea.
const KX = SPRITE_W / CELL_W;

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
  const color = normalizeColor(props.color);
  const jimena = props.skin === SKIN_JIMENA;
  const rawAccessory =
    props.accessory !== undefined && props.accessory !== ''
      ? props.accessory
      : props.skin === undefined
        ? GOTA_ROSTER[color]?.accessory
        : undefined;
  const accessory = rawAccessory?.toLowerCase();

  const region = jimena
    ? props.portrait
      ? JIMENA_PORTRAIT
      : JIMENA_FULL
    : props.portrait
      ? PORTRAIT
      : { x: 0, y: 0, w: CELL_W, h: CELL_H };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    if (jimena) {
      const url = jimenaBakedUrl(color, accessory);
      if (!url) return;
      const frames = JIMENA_FRAMES[props.view ?? 'front'];
      const names = props.walk ? frames.walk : frames.idle;
      sheet(url).then((img) => {
        if (!alive) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        let frame = 0;
        ctx.imageSmoothingEnabled = false;
        const draw = () => {
          const cell = accessoryCell(names[frame % names.length]);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(
            img,
            cell.sx + region.x,
            region.y,
            region.w,
            region.h,
            0,
            0,
            canvas.width,
            canvas.height,
          );
        };
        draw();
        if (props.animate && !motionIsReduced() && names.length > 1) {
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
        const sx = col * CELL_W + region.x;
        const sy = (props.ghost ? CELL_H : 0) + region.y;
        ctx.clearRect(0, 0, region.w, region.h);
        ctx.drawImage(b, sx, sy, region.w, region.h, 0, 0, region.w, region.h);
        if (a) ctx.drawImage(a, sx, sy, region.w, region.h, 0, 0, region.w, region.h);
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
    region.x,
    region.y,
    region.w,
    region.h,
  ]);

  return (
    <canvas
      ref={ref}
      className={`px-sprite ${props.className ?? ''}`}
      width={region.w}
      height={region.h}
      style={{
        width: jimena ? (region.w * scale) / KX : region.w * scale,
        height: jimena ? (region.h * scale) / KX : region.h * scale,
        opacity: props.ghost ? 0.7 : 1,
        transform: props.flip ? 'scaleX(-1)' : undefined,
      }}
    />
  );
}
