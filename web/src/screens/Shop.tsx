import { useEffect, useState } from 'react';
import { Stage } from '../ui/Stage';
import { Gota, ACCESSORIES, SERVER_COLORS, accessoryName, colorName } from '../ui/Gota';
import { Button, Chip, TitleBar } from '../ui/kit';
import { api } from '../api';
import { session } from '../session';
import {
  SKIN_GOTA,
  type ShopItem,
  type ShopResponse,
  gotaItemId,
} from '../shop';
import { ERROR_MESSAGES } from '../constants';
import { SHOP_TEXT as T } from '../texts';
import { BACKGROUNDS } from './backgrounds';

// Accesorio de muestra: se prueba sobre la gota de este color.
const PREVIEW_COLOR = SERVER_COLORS[3];

// Tienda: las gotas y los accesorios se compran con las monedas que dan
// las partidas. Los personajes de Jimena son gratis y no aparecen aquí.
export function Shop(props: { onClose: () => void; onUnauthorized: () => void }) {
  const data = session.loadSession();
  const [shop, setShop] = useState<ShopResponse | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

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

  const buy = async (item: ShopItem, name: string) => {
    if (!data || busy) return;
    setBusy(item.id);
    setError('');
    setNotice('');
    try {
      setShop(await api.buyItem(data.token, item.id));
      setNotice(T.bought(name));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const coins = shop?.coins ?? 0;
  const items = shop?.items ?? [];
  const characters = items.filter((i) => i.kind === 'character');
  const accessories = items.filter((i) => i.kind === 'accessory');

  const card = (item: ShopItem, name: string, preview: React.ReactNode) => {
    const affordable = coins >= item.price;
    return (
      <div
        key={item.id}
        className={`shop-card ${item.owned ? 'owned' : ''}`}
        data-item={item.id}
        title={!item.owned && !affordable ? T.NOT_ENOUGH : undefined}
      >
        <div className="shop-prev">{preview}</div>
        <b className="shop-name">{name}</b>
        {item.owned ? (
          <Chip tone="ok" icon="check">
            {T.OWNED}
          </Chip>
        ) : (
          <Button
            small
            variant={affordable ? 'pri' : 'sec'}
            disabled={!affordable || busy !== null}
            onClick={() => buy(item, name)}
          >
            {T.price(item.price)}
          </Button>
        )}
      </div>
    );
  };

  return (
    <Stage className="scr-shop" background={BACKGROUNDS.mapBlur}>
      <div className="shade dim" />
      <div
        className="row"
        style={{
          position: 'absolute',
          left: 60,
          right: 60,
          top: 20,
          height: 80,
          justifyContent: 'space-between',
        }}
      >
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

      <section
        className="panel"
        style={{ left: 60, top: 120, width: 880, height: 780, padding: '26px 30px' }}
      >
        <TitleBar icon="user" title={T.CHARACTERS} size={34} />
        <p className="muted shop-sub">{T.CHARACTERS_SUB}</p>
        <div className="shop-grid">
          {characters.map((item) => {
            const color = SERVER_COLORS.find((c) => gotaItemId(c) === item.id);
            if (!color) return null;
            return card(
              item,
              colorName(color),
              <Gota color={color} skin={SKIN_GOTA} scale={2.6} portrait />,
            );
          })}
        </div>
      </section>

      <section
        className="panel"
        style={{ left: 980, top: 120, width: 880, height: 780, padding: '26px 30px' }}
      >
        <TitleBar icon="user" title={T.ACCESSORIES} size={34} />
        <p className="muted shop-sub">{T.ACCESSORIES_SUB}</p>
        <div className="shop-grid six">
          {accessories.map((item) => {
            const known = ACCESSORIES.find((a) => a.id === item.id);
            return card(
              item,
              known ? known.name : accessoryName(item.id),
              <Gota
                color={PREVIEW_COLOR}
                accessory={item.id}
                skin={SKIN_GOTA}
                scale={2.6}
                portrait
              />,
            );
          })}
        </div>
      </section>

      <p className="shop-foot muted">{shop ? T.HINT_WIN : T.LOADING}</p>
    </Stage>
  );
}
