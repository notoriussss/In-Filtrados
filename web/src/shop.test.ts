import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ShopResponse,
  gotaItemId,
  loadCosmetics,
  ownedIds,
  saveCosmetics,
  skinOf,
} from './shop';
import { SERVER_COLORS } from './ui/Gota';

function fakeStorage(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set('in-filtrados-cosmetics', initial);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('shop ids', () => {
  it('names the gota of a color like match and players do', () => {
    expect(gotaItemId('#e6194b')).toBe('gota-e6194b');
    expect(gotaItemId('#F032E6')).toBe('gota-f032e6');
  });

  it('has a gota id for each of the 8 colors', () => {
    const ids = SERVER_COLORS.map(gotaItemId);
    expect(new Set(ids).size).toBe(8);
  });
});

describe('skinOf', () => {
  it('is jimena unless the player has the gota', () => {
    expect(skinOf(undefined)).toBe('jimena');
    expect(skinOf('')).toBe('jimena');
    expect(skinOf('otra')).toBe('jimena');
    expect(skinOf('gota')).toBe('gota');
  });
});

describe('ownedIds', () => {
  it('collects only what is owned', () => {
    const shop: ShopResponse = {
      coins: 10,
      items: [
        { id: 'cap', kind: 'accessory', price: 60, owned: true },
        { id: 'gota-e6194b', kind: 'character', price: 120, owned: false },
      ],
    };
    expect([...ownedIds(shop)]).toEqual(['cap']);
    expect(ownedIds(null).size).toBe(0);
  });
});

describe('cosmetics', () => {
  it('starts as jimena with no accessory', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    expect(loadCosmetics()).toEqual({ skin: 'jimena', accessory: '' });
  });

  it('remembers the last choice', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    saveCosmetics({ skin: 'gota', accessory: 'cap' });
    expect(loadCosmetics()).toEqual({ skin: 'gota', accessory: 'cap' });
  });

  it('ignores garbage in storage', () => {
    vi.stubGlobal('localStorage', fakeStorage('{no es json'));
    expect(loadCosmetics()).toEqual({ skin: 'jimena', accessory: '' });
    vi.stubGlobal(
      'localStorage',
      fakeStorage(JSON.stringify({ skin: 7, accessory: 3 })),
    );
    expect(loadCosmetics()).toEqual({ skin: 'jimena', accessory: '' });
  });
});
