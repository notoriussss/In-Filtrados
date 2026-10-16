// Sprites de los personajes (arte de Jimena,
// public/assets/characters/jimena). Cada color tiene 5 cuadros de
// 88 × 125: de frente (quieto) y dos pasos hacia cada lado.
const SPRITES_URL = '/assets/characters/jimena';

export type SpriteFrame =
  | 'front'
  | 'left-walking1'
  | 'left-walking2'
  | 'right-walking1'
  | 'right-walking2';

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

// preloadSprites pide todos los cuadros al entrar a la partida, para
// que nadie aparezca como círculo el primer segundo.
export function preloadSprites(): void {
  const frames: SpriteFrame[] = [
    'front',
    'left-walking1',
    'left-walking2',
    'right-walking1',
    'right-walking2',
  ];
  for (const color of Object.keys(SPRITE_COLORS)) {
    for (const frame of frames) spriteImage(color, frame);
  }
}
