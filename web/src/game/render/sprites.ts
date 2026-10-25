// Sprites de los personajes (arte de Jimena,
// public/assets/characters/jimena). Cada color tiene 14 cuadros de
// 88 × 125 (la espalda viene a 352 × 500, misma proporción): de frente
// y de espalda (quieto y un paso con cada pierna) y, hacia cada lado,
// dos pasos con los brazos adelante y atrás más dos cuadros de paso
// (passing) con el brazo al costado. Los pasos de frente y espalda y
// los passing se generaron a partir de los dibujos originales.
const SPRITES_URL = '/assets/characters/jimena';

export type SpriteFrame =
  | 'front'
  | 'front-walking1'
  | 'front-walking2'
  | 'back'
  | 'back-walking1'
  | 'back-walking2'
  | 'left-walking1'
  | 'left-passing1'
  | 'left-walking2'
  | 'left-passing2'
  | 'right-walking1'
  | 'right-passing1'
  | 'right-walking2'
  | 'right-passing2';

export const SPRITE_W = 88;
export const SPRITE_H = 125;

// Los 8 colores fijos de match (state.go) y el nombre de su sprite.
export const SPRITE_COLORS: Record<string, string> = {
  '#e6194b': 'Red',
  '#3cb44b': 'Green',
  '#ffe119': 'Yellow',
  '#4363d8': 'Blue',
  '#f58231': 'Orange',
  '#911eb4': 'Purple',
  '#46f0f0': 'Cyan',
  '#f032e6': 'Magenta',
};

// spriteFile es la ruta del cuadro dentro de assets/player.
export function spriteFile(color: string, frame: SpriteFrame): string | null {
  const name = SPRITE_COLORS[color.toLowerCase()];
  return name ? `${name}_Player-${frame}.png` : null;
}

const cache = new Map<string, HTMLImageElement>();

// spriteImage devuelve el cuadro listo para dibujar, o null mientras
// carga (o si el color no tiene sprite): quien dibuja usa un círculo.
export function spriteImage(
  color: string,
  frame: SpriteFrame,
): HTMLImageElement | null {
  const file = spriteFile(color, frame);
  if (!file || typeof Image === 'undefined') return null;
  let img = cache.get(file);
  if (!img) {
    img = new Image();
    img.src = `${SPRITES_URL}/${file}`;
    cache.set(file, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

// spriteImageOrFront es spriteImage, pero si el cuadro todavía no cargó
// o no existe (un color sin espalda, por ejemplo) usa el de frente.
export function spriteImageOrFront(
  color: string,
  frame: SpriteFrame,
): HTMLImageElement | null {
  return spriteImage(color, frame) ?? spriteImage(color, 'front');
}

// preloadSprites pide todos los cuadros al entrar a la partida, para
// que nadie aparezca como círculo el primer segundo.
export function preloadSprites(): void {
  const frames: SpriteFrame[] = [
    'front',
    'front-walking1',
    'front-walking2',
    'back',
    'back-walking1',
    'back-walking2',
    'left-walking1',
    'left-passing1',
    'left-walking2',
    'left-passing2',
    'right-walking1',
    'right-passing1',
    'right-walking2',
    'right-passing2',
  ];
  for (const color of Object.keys(SPRITE_COLORS)) {
    for (const frame of frames) spriteImage(color, frame);
  }
}
