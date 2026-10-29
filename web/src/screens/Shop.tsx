import { type ReactNode, useEffect, useState } from 'react';
import { Stage } from '../ui/Stage';
import {
  ACCESSORIES,
  Gota,
  SERVER_COLORS,
  accessoryName,
  colorName,
} from '../ui/Gota';
import { HintBar } from '../ui/kit';
import { api } from '../api';
import { session } from '../session';
import {
  ACCESSORY_CATEGORIES,
  type AccessoryCategory,
  type Cosmetics,
  SKIN_GOTA,
  SKIN_JIMENA,
  type ShopResponse,
  type Skin,
  gotaItemId,
  loadCosmetics,
  ownedIds,
  saveCosmetics,
} from '../shop';
import { ERROR_MESSAGES } from '../constants';
import { SHOP_TEXT as T } from '../texts';
import { BACKGROUNDS } from './backgrounds';
import '../styles/shop.css';

type Tab = 'characters' | AccessoryCategory;

// Lo que se está mirando en la rejilla (no siempre es lo que se lleva
// puesto: lo bloqueado se mira antes de comprarlo).
type Focus =
  | { kind: 'char'; skin: Skin; color: string }
  | { kind: 'acc'; id: string };

const TABS: { id: Tab; label: string }[] = [
  { id: 'characters', label: T.TAB_CHARACTERS },
  { id: 'head', label: T.TAB_HEAD },
  { id: 'face', label: T.TAB_FACE },
  { id: 'body', label: T.TAB_BODY },
];

const NONE = 'none'; // sin accesorio: no se compra

function skinLabel(skin: Skin, color: string): string {
  return `${skin === SKIN_GOTA ? T.GOTA : T.JIMENA} · ${colorName(color)}`;
}

function priceOf(shop: ShopResponse | null, id: string): number {
  return shop?.items.find((i) => i.id === id)?.price ?? 0;
}

function itemName(id: string): string {
  const color = SERVER_COLORS.find((c) => gotaItemId(c) === id);
  return color ? skinLabel(SKIN_GOTA, color) : accessoryName(id);
}

type TileProps = {
  label: string;
  locked: boolean;
  price: number;
  on: boolean;
  focused: boolean;
  noAcc?: boolean;
  onClick: () => void;
  preview: ReactNode;
};

function Tile(props: TileProps) {
  const cls = [
    'shop-card',
    props.locked ? 'locked' : '',
    props.on ? 'on' : '',
    props.focused ? 'focus' : '',
    props.noAcc ? 'no-acc' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const tagClass = props.on
    ? 'shop-card-tag on'
    : props.locked
      ? 'shop-card-tag price'
      : 'shop-card-tag owned';

  const tagText = props.on
    ? T.EQUIPPED
    : props.locked
      ? T.price(props.price)
      : T.OWNED;

  return (
    <button
      type="button"
      className={cls}
      title={
        props.locked
          ? `${props.label} · ${T.price(props.price)}`
          : props.label
      }
      aria-pressed={props.focused || props.on}
      onClick={props.onClick}
    >
      <div className="shop-card-top">
        {!props.noAcc && <span className={tagClass}>{tagText}</span>}
      </div>
      <div className="shop-card-prev">{props.preview}</div>
      <span className="shop-card-name">{props.label}</span>
    </button>
  );
}

// Tienda y vestidor de escenario abierto: riel vertical de categorías a la
// izquierda, personaje de cuerpo completo sobre pedestal circular al centro,
// y rejilla de vestidor a la derecha.
export function Shop(props: {
  onClose: () => void;
  onUnauthorized: () => void;
}) {
  const data = session.loadSession();
  const [shop, setShop] = useState<ShopResponse | null>(null);
  const [eq, setEq] = useState<Cosmetics>(() => {
    const saved = loadCosmetics();
    return { ...saved, color: saved.color || SERVER_COLORS[0] };
  });
  const [tab, setTab] = useState<Tab>('characters');
  const [focus, setFocus] = useState<Focus | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const fail = (err: unknown) => {
    const message = err instanceof Error ? err.message : '';
    if (/401|token/i.test(message)) props.onUnauthorized();
    else setError(message || ERROR_MESSAGES.SERVICE_UNAVAILABLE);
  };

  useEffect(() => {
    if (!data) return;
    let alive = true;
    api.getShop(data.token).then(
      (s) => alive && setShop(s),
      (err) => alive && fail(err),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') props.onClose();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [props]);

  const owned = ownedIds(shop);
  const ownsChar = (skin: Skin, color: string, have = owned) =>
    skin === SKIN_JIMENA || have.has(gotaItemId(color));
  const ownsAcc = (id: string, have = owned) => id === NONE || have.has(id);

  const equip = (next: Cosmetics) => {
    setEq(next);
    saveCosmetics(next);
  };

  // Lo que muestra el personaje central: lo que se mira o lo que lleva puesto.
  const look: Cosmetics = {
    skin: focus?.kind === 'char' ? focus.skin : eq.skin,
    color: focus?.kind === 'char' ? focus.color : eq.color,
    accessory: focus?.kind === 'acc' ? focus.id : eq.accessory,
  };
  const lookAcc = look.accessory || NONE;

  // Qué falta comprar para llevar eso puesto: primero la gota del color y
  // después el accesorio.
  const toBuy = !ownsChar(look.skin, look.color)
    ? gotaItemId(look.color)
    : !ownsAcc(lookAcc)
      ? lookAcc
      : null;

  const pickChar = (skin: Skin, color: string) => {
    setFocus({ kind: 'char', skin, color });
    setNotice('');
    if (ownsChar(skin, color)) equip({ ...eq, skin, color });
  };

  const pickAcc = (id: string) => {
    setFocus({ kind: 'acc', id });
    setNotice('');
    if (ownsAcc(id)) equip({ ...eq, accessory: id === NONE ? '' : id });
  };

  const buy = async () => {
    if (!data || !toBuy || busy) return;
    setBusy(true);
    setError('');
    try {
      const next = await api.buyItem(data.token, toBuy);
      setShop(next);
      setNotice(T.bought(itemName(toBuy)));
      const have = ownedIds(next);
      if (ownsChar(look.skin, look.color, have) && ownsAcc(lookAcc, have)) {
        equip({
          skin: look.skin,
          color: look.color,
          accessory: lookAcc === NONE ? '' : lookAcc,
        });
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const coins = shop?.coins ?? 0;
  const price = toBuy ? priceOf(shop, toBuy) : 0;
  const affordable = coins >= price;
  const equipped =
    toBuy === null &&
    look.skin === eq.skin &&
    look.color === eq.color &&
    (look.accessory || '') === (eq.accessory || '');

  const accLabel =
    lookAcc === NONE
      ? T.NO_ACCESSORY
      : (ACCESSORIES.find((a) => a.id === lookAcc)?.name ?? lookAcc);

  const categoryProgress = (t: Tab): string => {
    if (t === 'characters') {
      const total = SERVER_COLORS.length * 2;
      const gotaOwned = SERVER_COLORS.filter((c) =>
        ownsChar(SKIN_GOTA, c),
      ).length;
      return T.unlockedCount(SERVER_COLORS.length + gotaOwned, total);
    }
    const items = ACCESSORY_CATEGORIES[t];
    const unlocked = items.filter((id) => ownsAcc(id)).length;
    return T.unlockedCount(unlocked, items.length);
  };

  const activeTabLabel =
    TABS.find((t) => t.id === tab)?.label ?? T.TAB_CHARACTERS;
  const activeItemLabel =
    tab === 'characters' ? skinLabel(look.skin, look.color) : accLabel;

  const grid =
    tab === 'characters'
      ? ([SKIN_JIMENA, SKIN_GOTA] as Skin[]).flatMap((skin) =>
          SERVER_COLORS.map((color) => (
            <Tile
              key={`${skin}-${color}`}
              label={skinLabel(skin, color)}
              locked={!ownsChar(skin, color)}
              price={priceOf(shop, gotaItemId(color))}
              on={eq.skin === skin && eq.color === color}
              focused={
                focus?.kind === 'char' &&
                focus.skin === skin &&
                focus.color === color
              }
              onClick={() => pickChar(skin, color)}
              preview={<Gota color={color} skin={skin} scale={2.3} portrait />}
            />
          )),
        )
      : [NONE, ...ACCESSORY_CATEGORIES[tab]].map((id) => (
          <Tile
            key={id}
            label={id === NONE ? T.NO_ACCESSORY : accessoryName(id)}
            locked={!ownsAcc(id)}
            price={priceOf(shop, id)}
            on={(eq.accessory || NONE) === id}
            focused={focus?.kind === 'acc' && focus.id === id}
            noAcc={id === NONE}
            onClick={() => pickAcc(id)}
            preview={
              id === NONE ? (
                <span className="shop-none-glyph">✕</span>
              ) : (
                <Gota
                  color={look.color}
                  skin={look.skin}
                  accessory={id}
                  scale={tab === 'body' ? 1.55 : 2.15}
                  portrait={tab !== 'body'}
                />
              )
            }
          />
        ));

  return (
    <Stage className="scr-shop" background={BACKGROUNDS.mapBlur}>
      <div className="shop-vignette" />

      {/* BARRA SUPERIOR */}
      <header className="shop-header">
        <div className="shop-header-left">
          <button
            type="button"
            className="shop-back-btn"
            onClick={props.onClose}
          >
            {T.BACK}
          </button>
        </div>

        <div className="shop-header-right">
          {notice && (
            <div className="shop-feedback-pill ok" role="status">
              {notice}
            </div>
          )}
          {error && (
            <div className="shop-feedback-pill bad" role="alert">
              {error}
            </div>
          )}
          <div className="shop-coins-pill">
            <span>{T.COINS}</span>
            <strong className="shop-coins-val">
              {shop ? T.price(coins) : '—'}
            </strong>
          </div>
        </div>
      </header>

      {/* ESCENARIO PRINCIPAL DE 3 ZONAS */}
      <div className="shop-main">
        {/* 1. RIEL VERTICAL DE CATEGORÍAS */}
        <nav className="shop-cat-rail" role="tablist" aria-label={T.TITLE}>
          {TABS.map((t) => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`shop-cat-tab ${isActive ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <span className="shop-cat-label">{t.label}</span>
                <span className="shop-cat-count">{categoryProgress(t.id)}</span>
              </button>
            );
          })}
        </nav>

        {/* 2. ESCENARIO CENTRAL DEL PERSONAJE */}
        <section className="shop-hero-stage">
          <div className="shop-pedestal-zone">
            <div className="shop-ring-outer" />
            <div className="shop-ring-inner" />
            <div className="shop-floor-shadow" />
            <div className="shop-hero-figure">
              <Gota
                color={look.color}
                skin={look.skin}
                accessory={lookAcc === NONE ? '' : lookAcc}
                scale={7.2}
                animate
              />
            </div>
          </div>

          <div className="shop-hero-footer">
            <strong className="shop-preview-title">
              {skinLabel(look.skin, look.color)}
            </strong>
            <span className="shop-preview-sub">{accLabel}</span>

            <div className="shop-cta-wrap">
              {toBuy ? (
                <button
                  type="button"
                  className={`shop-cta-btn ${affordable ? 'buy' : 'locked'}`}
                  disabled={!affordable || busy}
                  onClick={buy}
                >
                  {affordable
                    ? `${T.BUY} ${itemName(toBuy)} · ${T.price(price)}`
                    : `${T.NOT_ENOUGH} (${T.price(price)})`}
                </button>
              ) : (
                <div className="shop-cta-badge">
                  {equipped ? T.EQUIPPED : T.OWNED}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 3. PANEL DE GUARDARROPA A LA DERECHA */}
        <section className="shop-wardrobe-col">
          <header className="shop-wardrobe-header">
            <div className="shop-wardrobe-heading">
              <span className="shop-wardrobe-cat">{activeTabLabel}</span>
              <span className="shop-wardrobe-dot">·</span>
              <span className="shop-wardrobe-item">{activeItemLabel}</span>
            </div>
          </header>

          <div className="shop-grid-scroll">
            <div className="shop-grid">{grid}</div>
            {!shop && <p className="shop-loading-note">{T.LOADING}</p>}
          </div>
        </section>
      </div>

      <HintBar hints={[['Esc', T.BACK]]} />
    </Stage>
  );
}
