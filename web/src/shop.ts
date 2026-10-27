// Tienda: lo que se compra con monedas (docs/tasks.md, tienda). Los
// personajes de Jimena vienen de inicio; las gotas y los accesorios se
// compran. El servidor de `players` pone los precios; aquí solo se usan.

export type ShopKind = 'character' | 'accessory';

export type ShopItem = {
  id: string;
  kind: ShopKind;
  price: number;
  owned: boolean;
};

export type ShopResponse = {
  coins: number;
  items: ShopItem[];
};

// Personaje que se ve en la partida: el de Jimena o la gota comprada.
export type Skin = 'jimena' | 'gota';

export const SKIN_JIMENA: Skin = 'jimena';
export const SKIN_GOTA: Skin = 'gota';

// skinOf: un jugador sin personaje (snapshots viejos) usa el de Jimena.
export function skinOf(skin: string | undefined): Skin {
  return skin === SKIN_GOTA ? SKIN_GOTA : SKIN_JIMENA;
}

// gotaItemId es el artículo que da la gota de un color de match
// ("#e6194b" → "gota-e6194b"), igual que en match y en players.
export function gotaItemId(color: string): string {
  return `gota-${color.toLowerCase().replace('#', '')}`;
}

export function ownedIds(shop: ShopResponse | null): Set<string> {
  return new Set(shop?.items.filter((i) => i.owned).map((i) => i.id));
}

// Lo último que eligió el jugador, para ponérselo solo al entrar a una
// sala (match vuelve a validar que lo tenga comprado).
export type Cosmetics = { skin: Skin; accessory: string };

const COSMETICS_KEY = 'in-filtrados-cosmetics';
const NO_COSMETICS: Cosmetics = { skin: SKIN_JIMENA, accessory: '' };

export function loadCosmetics(): Cosmetics {
  try {
    const raw = localStorage.getItem(COSMETICS_KEY);
    if (!raw) return NO_COSMETICS;
    const data = JSON.parse(raw) as Partial<Cosmetics>;
    return {
      skin: skinOf(data.skin),
      accessory: typeof data.accessory === 'string' ? data.accessory : '',
    };
  } catch {
    return NO_COSMETICS;
  }
}

export function saveCosmetics(next: Cosmetics): void {
  try {
    localStorage.setItem(COSMETICS_KEY, JSON.stringify(next));
  } catch {
    // Sin localStorage solo se pierde la preferencia.
  }
}
