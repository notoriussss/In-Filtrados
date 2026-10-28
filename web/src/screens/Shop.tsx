import { type ReactNode, useEffect, useState } from 'react';
import { Stage } from '../ui/Stage';
import {
  ACCESSORIES,
  Gota,
  SERVER_COLORS,
  accessoryName,
  colorName,
} from '../ui/Gota';
import { Button, Chip } from '../ui/kit';
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
  onClick: () => void;
  preview: ReactNode;
};

function Tile(props: TileProps) {
  const cls = [
    'wd-tile',
    props.locked ? 'locked' : '',
    props.on ? 'on' : '',
    props.focused ? 'focus' : '',
  ]
    .filter(Boolean)
    .join(' ');
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
      <span className="wd-prev">{props.preview}</span>
      <span className="wd-name">{props.label}</span>
      <span className="wd-tag">
        {props.on ? '✓' : props.locked ? T.price(props.price) : ''}
      </span>
    </button>
  );
}

// Tienda y vestidor: a la izquierda lo que se puede llevar, por pestañas;
// a la derecha tu personaje de cuerpo completo con eso puesto. Lo que ya
// es tuyo se pone al tocarlo; lo bloqueado se mira y se compra con monedas.
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

  // Lo que muestra el personaje de la derecha: lo que se mira o, si no se
  // mira nada, lo que se lleva puesto.
  const look: Cosmetics = {
    skin: focus?.kind === 'char' ? focus.skin : eq.skin,
    color: focus?.kind === 'char' ? focus.color : eq.color,
    accessory: focus?.kind === 'acc' ? focus.id : eq.accessory,
  };
  const lookAcc = look.accessory || NONE;

  // Qué falta comprar para llevar eso puesto: primero la gota del color y
  // después el accesorio. Se compra de a una cosa.
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
      // Lo comprado se lleva puesto de una vez, si ya está todo.
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
    look.accessory === eq.accessory;

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
              preview={<Gota color={color} skin={skin} scale={2.8} portrait />}
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
            onClick={() => pickAcc(id)}
            preview={
              id === NONE ? (
                <span className="wd-none">✕</span>
              ) : (
                <Gota
                  color={eq.color}
                  skin={eq.skin}
                  accessory={id}
                  scale={tab === 'body' ? 1.7 : 2.8}
                  portrait={tab !== 'body'}
                />
              )
            }
          />
        ));

  const accLabel =
    lookAcc === NONE
      ? T.NO_ACCESSORY
      : (ACCESSORIES.find((a) => a.id === lookAcc)?.name ?? lookAcc);

  return (
    <Stage className="scr-shop" background={BACKGROUNDS.mapBlur}>
      <div className="shade dim" />
      <div className="wd-top">
        <div className="row">
          <Button variant="sec" small icon="left" onClick={props.onClose}>
            {T.BACK}
          </Button>
          <span className="h2 screen-title">{T.TITLE}</span>
        </div>
        <div className="row">
          {notice && (
            <Chip tone="ok" big icon="check">
              {notice}
            </Chip>
          )}
          {error && (
            <Chip tone="bad" big icon="cross">
              {error}
            </Chip>
          )}
          <Chip tone="info" big icon="drop">
            {T.COINS}: <b>{shop ? coins : '—'}</b>
          </Chip>
        </div>
      </div>

      <nav className="wd-tabs" role="tablist" aria-label={T.TITLE}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`wd-tab ${tab === t.id ? 'on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section className="panel wd-grid-panel">
        <div className="wd-grid">{grid}</div>
        {!shop && <p className="muted wd-foot">{T.LOADING}</p>}
      </section>

      <section className="panel wd-stage-panel">
        <div className="wd-figure">
          <div className="wd-plank" />
          <Gota
            color={look.color}
            skin={look.skin}
            accessory={look.accessory}
            scale={9}
            animate
          />
        </div>
        <b className="wd-title">{skinLabel(look.skin, look.color)}</b>
        <span className="muted wd-sub">{accLabel}</span>
        <div className="wd-action">
          {toBuy ? (
            <Button
              variant={affordable ? 'pri' : 'sec'}
              disabled={!affordable || busy}
              onClick={buy}
            >
              {affordable
                ? `${T.BUY} ${itemName(toBuy)} · ${T.price(price)}`
                : `${T.NOT_ENOUGH} (${T.price(price)})`}
            </Button>
          ) : (
            <Chip tone="ok" big icon="check">
              {equipped ? T.EQUIPPED : T.OWNED}
            </Chip>
          )}
        </div>
      </section>
    </Stage>
  );
}
