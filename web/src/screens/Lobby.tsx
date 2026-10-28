import { useEffect, useRef, useState } from 'react';
import type { PlayerView } from '@in-filtrados/messages';
import { Stage } from '../ui/Stage';
import {
  Gota,
  SERVER_COLORS,
  colorName,
  ACCESSORIES,
  accessoryName,
} from '../ui/Gota';
import { Icon } from '../ui/Icon';
import { Button, Chip, Pill, TitleBar } from '../ui/kit';
import { api, type MeResponse } from '../api';
import {
  SKIN_GOTA,
  SKIN_JIMENA,
  type ShopResponse,
  type Skin,
  gotaItemId,
  loadCosmetics,
  ownedIds,
  saveCosmetics,
  skinOf,
} from '../shop';
import { session } from '../session';
import { gameMap } from '../map';
import type { GameSession } from '../game/session';
import { LOBBY_TEXT } from '../texts';
import { BACKGROUNDS } from './backgrounds';
import { useGame } from './game/useGame';
import { ChoiceGrid } from './pending/ChoiceGrid';
import { FEATURES } from '../features';
import { shownTaskCount, taskCountOptions } from '../game/taskCount';

const NO_ACCESSORY = 'none'; // pickAccessory: quitar el accesorio
const MAP_THUMB = '/assets/map/manglar-verde/thumbnail.jpg';
const MAX_SLOTS = 10; // match acepta hasta 10 jugadores por sala
const MIN_PLAYERS = 2;
const TWO_IMPOSTORS_FROM = 7; // twoImpostorsFrom en match

function accessoryLabel(id: string): string {
  return id === NO_ACCESSORY ? LOBBY_TEXT.NO_ACCESSORY : accessoryName(id);
}

// Lobby (maqueta 06-lobby): tu gota con tu color, los jugadores de la
// sala, el mapa y el botón de empezar (solo quien creó la sala). La
// elección de accesorio y el chat de sala de la maqueta no existen en
// el servidor, así que en su lugar van tu perfil y cómo se gana.
export function Lobby(props: {
  game: GameSession;
  onLeave: () => void;
  onStarted: () => void;
}) {
  const state = useGame(props.game);
  const data = session.loadSession();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAccessoryMenu, setShowAccessoryMenu] = useState(false);
  const [shop, setShop] = useState<ShopResponse | null>(null);
  const prefsApplied = useRef(false);
  const snap = state.snapshot;

  useEffect(() => {
    if (snap && snap.phase !== 'LOBBY') props.onStarted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap?.phase]);

  useEffect(() => {
    if (!data) return;
    api.getMe(data.token).then(setMe, () => setMe(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lo comprado: se lee al entrar y al volver a esta pestaña (por si se
  // compró en otra); en ese caso también se le avisa al servidor de juego.
  useEffect(() => {
    if (!data) return;
    const load = (notify: boolean) => {
      api.getShop(data.token).then(
        (s) => {
          setShop(s);
          if (notify) props.game.send({ type: 'refreshShop' });
        },
        () => setShop(null),
      );
    };
    load(false);
    const onFocus = () => load(true);
    addEventListener('focus', onFocus);
    return () => removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const players = snap?.players ?? [];
  const meView = players.find((p) => p.id === data?.playerId);
  const host = players[0]; // match pone primero a quien creó la sala
  const isHost = Boolean(data?.isCreator);
  const tasksPerPlayer = shownTaskCount(snap?.tasksPerPlayer);
  const connected = players.filter((p) => p.connected).length;
  const myColor = meView?.color ?? SERVER_COLORS[1];
  const mySkin = skinOf(meView?.skin);
  const myAccessory = meView?.accessory || NO_ACCESSORY;
  const owned = ownedIds(shop);
  const gotaOwned = owned.has(gotaItemId(myColor));

  // Al entrar se vuelve a poner lo último que se eligió; match revisa que
  // de verdad esté comprado.
  useEffect(() => {
    if (prefsApplied.current || !meView || !shop) return;
    prefsApplied.current = true;
    const prefs = loadCosmetics();
    // match ignora el color si otro jugador ya lo tiene; entonces la gota
    // que vale es la del color que quedó.
    const wanted = prefs.color.toLowerCase();
    const taken = players.some(
      (p) => p.id !== meView.id && p.connected && p.color.toLowerCase() === wanted,
    );
    const color = wanted && !taken ? wanted : myColor.toLowerCase();
    if (color !== myColor.toLowerCase()) {
      props.game.send({ type: 'pickColor', color });
    }
    if (prefs.skin === SKIN_GOTA && owned.has(gotaItemId(color))) {
      props.game.send({ type: 'pickSkin', skin: SKIN_GOTA });
    }
    if (prefs.accessory && owned.has(prefs.accessory)) {
      props.game.send({ type: 'pickAccessory', accessory: prefs.accessory });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meView?.id, shop]);

  const pickSkin = (skin: Skin) => {
    if (skin !== mySkin) props.game.send({ type: 'pickSkin', skin });
    saveCosmetics({ ...loadCosmetics(), skin });
  };
  const pickAccessory = (id: string) => {
    if (id !== myAccessory) {
      props.game.send({ type: 'pickAccessory', accessory: id });
    }
    saveCosmetics({
      ...loadCosmetics(),
      accessory: id === NO_ACCESSORY ? '' : id,
    });
    setShowAccessoryMenu(false);
  };
  const code = data?.roomCode ?? '----';
  const impostors = players.length >= TWO_IMPOSTORS_FROM ? 2 : 1;
  const compact = players.length > 8;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sin permiso: el código se ve en grande igual.
    }
  };

  return (
    <Stage className="scr-lobby" background={BACKGROUNDS.mapBlur}>
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
          <Button variant="sec" small icon="left" onClick={props.onLeave}>
            {LOBBY_TEXT.LEAVE}
          </Button>
          <span className="h2 screen-title">{LOBBY_TEXT.TITLE}</span>
        </div>
        <div className="row">
          <Chip tone="info" big icon="map">
            {gameMap.name}
          </Chip>
          <Chip big icon="user">
            {players.length} / {MAX_SLOTS}
          </Chip>
          <span className="code">{code}</span>
          <Button small icon={copied ? 'check' : 'copy'} onClick={copy}>
            {copied ? LOBBY_TEXT.COPIED : LOBBY_TEXT.COPY}
          </Button>
        </div>
      </div>

      <section
        className="panel"
        style={{
          left: 60,
          top: 120,
          width: 620,
          height: 840,
          padding: '26px 30px',
        }}
      >
        <TitleBar icon="user" title={LOBBY_TEXT.YOUR_GOTA} size={34}>
          <Chip tone="ok" className="name-chip">
            <span className="fit" title={data?.username}>
              {data?.username}
            </span>
          </Chip>
        </TitleBar>
        <div className="prev stand" style={{ position: 'relative' }}>
          <div className="plank" />
          <Gota
            color={myColor}
            accessory={meView?.accessory}
            skin={mySkin}
            scale={4}
            animate
          />
          {FEATURES.accessoryPicker && (
            <Button
              variant="sec"
              small
              style={{
                position: 'absolute',
                top: 6,
                right: 8,
                zIndex: 5,
                fontSize: 18,
                minHeight: 34,
                padding: '4px 12px 2px',
                maxWidth: 300,
                gap: 6,
              }}
              onClick={() => setShowAccessoryMenu((open) => !open)}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={accessoryLabel(myAccessory)}
              >
                {accessoryLabel(myAccessory)}
              </span>
              <span style={{ fontSize: 13, opacity: 0.8 }}>▾</span>
            </Button>
          )}
          {showAccessoryMenu && (
            <>
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 15,
                }}
                onClick={() => setShowAccessoryMenu(false)}
              />
              <div
                className="panel"
                style={{
                  position: 'absolute',
                  top: 46,
                  right: 8,
                  left: 8,
                  zIndex: 20,
                  padding: '14px 16px',
                  boxShadow: '0 12px 28px rgba(0,0,0,0.7)',
                }}
              >
                <div
                  className="row"
                  style={{
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  <span className="lab" style={{ margin: 0 }}>
                    {LOBBY_TEXT.CHOOSE_ACCESSORY}
                  </span>
                  <Button
                    variant="sec"
                    small
                    icon="cross"
                    style={{
                      fontSize: 18,
                      minHeight: 34,
                      padding: '4px 12px 2px',
                      gap: 6,
                    }}
                    onClick={() => setShowAccessoryMenu(false)}
                  >
                    {LOBBY_TEXT.CLOSE}
                  </Button>
                </div>
                <ChoiceGrid
                  kind="accessory"
                  label={LOBBY_TEXT.ACCESSORY}
                  value={myAccessory}
                  choices={[
                    {
                      id: NO_ACCESSORY,
                      label: LOBBY_TEXT.NO_ACCESSORY,
                      preview: <Icon name="cross" size={28} />,
                    },
                    ...ACCESSORIES.map((a) => ({
                      id: a.id,
                      label: owned.has(a.id)
                        ? a.name
                        : LOBBY_TEXT.lockedHint(a.name),
                      locked: !owned.has(a.id),
                      preview: (
                        <Gota
                          color={myColor}
                          accessory={a.id}
                          skin={mySkin}
                          scale={1.4}
                          portrait
                        />
                      ),
                    })),
                  ]}
                  onPick={pickAccessory}
                />
              </div>
            </>
          )}
        </div>
        <div className="lab">{LOBBY_TEXT.CHARACTER}</div>
        <div className="chars">
          <ChoiceGrid
            kind="accessory"
            label={LOBBY_TEXT.CHARACTER}
            value={mySkin}
            choices={[
              {
                id: SKIN_JIMENA,
                label: LOBBY_TEXT.CHARACTER_JIMENA,
                preview: (
                  <Gota
                    color={myColor}
                    skin={SKIN_JIMENA}
                    scale={1.6}
                    portrait
                  />
                ),
              },
              {
                id: SKIN_GOTA,
                label: gotaOwned
                  ? LOBBY_TEXT.CHARACTER_GOTA
                  : LOBBY_TEXT.lockedHint(LOBBY_TEXT.CHARACTER_GOTA),
                locked: !gotaOwned,
                preview: (
                  <Gota
                    color={myColor}
                    skin={SKIN_GOTA}
                    scale={1.6}
                    portrait
                  />
                ),
              },
            ]}
            onPick={(id) => pickSkin(id as Skin)}
          />
        </div>
        <div className="lab" style={{ marginTop: 14 }}>
          {LOBBY_TEXT.COLOR}{' '}
          <span className="muted">· {colorName(myColor)}</span>
        </div>
        {FEATURES.colorPicker ? (
          <ChoiceGrid
            kind="color"
            label={LOBBY_TEXT.COLOR}
            value={myColor.toLowerCase()}
            choices={SERVER_COLORS.map((c) => ({
              id: c,
              label: colorName(c),
              swatch: c,
              // Solo otro jugador conectado bloquea el color, igual que
              // en match.
              taken: players.some(
                (p) =>
                  p.id !== meView?.id &&
                  p.connected &&
                  p.color.toLowerCase() === c,
              ),
            }))}
            onPick={(c) => {
              if (c !== myColor.toLowerCase()) {
                props.game.send({ type: 'pickColor', color: c });
                saveCosmetics({ ...loadCosmetics(), color: c });
              }
            }}
          />
        ) : (
          <div className="swatches" role="radiogroup">
            {SERVER_COLORS.map((c) => {
              const mine = c === myColor.toLowerCase();
              const taken = players.some((p) => p.color.toLowerCase() === c);
              return (
                <span
                  key={c}
                  className={`sw ${mine ? 'me' : taken ? 'taken' : ''}`}
                  style={{ background: c }}
                  role="radio"
                  aria-checked={mine}
                  aria-label={colorName(c)}
                >
                  {mine && <Icon name="check" palette="dark" size={24} />}
                </span>
              );
            })}
          </div>
        )}
        <div className="lab" style={{ marginTop: 22 }}>
          {LOBBY_TEXT.PROFILE}
        </div>
        <div className="well stat-grid">
          <span>{LOBBY_TEXT.COINS}</span>
          <b>{me?.coins ?? '—'}</b>
          <span>{LOBBY_TEXT.MATCHES}</span>
          <b>{me?.matchesPlayed ?? '—'}</b>
          <span>{LOBBY_TEXT.WINS}</span>
          <b>{me?.wins ?? '—'}</b>
          <span>{LOBBY_TEXT.TIMES_IMPOSTOR}</span>
          <b>{me?.timesImpostor ?? '—'}</b>
          <span>{LOBBY_TEXT.WINS_IMPOSTOR}</span>
          <b>{me?.winsAsImpostor ?? '—'}</b>
        </div>
      </section>

      <section
        className="panel"
        style={{
          left: 700,
          top: 120,
          width: 620,
          height: 840,
          padding: '26px 30px',
        }}
      >
        <TitleBar icon="user" title={LOBBY_TEXT.PLAYERS} size={34}>
          <Chip tone={connected >= MIN_PLAYERS ? 'ok' : 'warn'}>
            {LOBBY_TEXT.connected(connected)}
          </Chip>
        </TitleBar>
        {Array.from({
          length: Math.max(compact ? MAX_SLOTS : 8, players.length),
        })
          .slice(0, MAX_SLOTS)
          .map((_, i) => (
            <PlayerSlot
              key={players[i]?.id ?? `empty-${i}`}
              player={players[i]}
              isMe={players[i]?.id === data?.playerId}
              isHost={players[i] !== undefined && players[i] === host}
              compact={compact}
            />
          ))}
      </section>

      <section
        className="panel"
        style={{
          left: 1340,
          top: 120,
          width: 520,
          height: 840,
          padding: '26px 28px',
        }}
      >
        <div className="imgbox" style={{ height: 190 }}>
          <img src={MAP_THUMB} alt={gameMap.name} />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <b style={{ fontSize: 28 }}>{gameMap.name}</b>
        </div>
        <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
          <Chip>{LOBBY_TEXT.impostors(impostors)}</Chip>
          <Chip>{LOBBY_TEXT.tasks(tasksPerPlayer)}</Chip>
          <Chip>{LOBBY_TEXT.DURATION}</Chip>
        </div>
        {isHost && (
          <>
            <div className="lab" style={{ marginTop: 14 }}>
              {LOBBY_TEXT.TASK_COUNT}
            </div>
            <div
              className="row"
              role="radiogroup"
              aria-label={LOBBY_TEXT.TASK_COUNT}
              style={{ gap: 8, flexWrap: 'wrap' }}
            >
              {taskCountOptions().map((n) => (
                <Button
                  key={n}
                  small
                  variant={n === tasksPerPlayer ? 'pri' : ''}
                  onClick={() => {
                    if (n !== tasksPerPlayer) {
                      props.game.send({
                        type: 'setTaskCount',
                        tasksPerPlayer: n,
                      });
                    }
                  }}
                >
                  {n}
                </Button>
              ))}
            </div>
          </>
        )}
        {host && (
          <p className="small muted" style={{ marginTop: 8 }}>
            {LOBBY_TEXT.onlyHost(host.name)}
          </p>
        )}
        <div className="lab" style={{ marginTop: 18 }}>
          {LOBBY_TEXT.HOW_TO_WIN}
        </div>
        <div className="well" style={{ padding: 16 }}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Icon name="drop" palette="leaf" size={30} />
            <span className="small">{LOBBY_TEXT.WIN_CREW}</span>
          </div>
          <div
            className="row"
            style={{ alignItems: 'flex-start', marginTop: 12 }}
          >
            <Icon name="oil" palette="coral" size={30} />
            <span className="small">{LOBBY_TEXT.WIN_IMPOSTOR}</span>
          </div>
        </div>
      </section>

      <div
        className="row"
        style={{
          position: 'absolute',
          left: 60,
          right: 60,
          top: 985,
          justifyContent: 'space-between',
        }}
      >
        <Pill icon="clock">{LOBBY_TEXT.MIN_PLAYERS}</Pill>
        {isHost ? (
          <Button
            variant={connected >= MIN_PLAYERS ? 'pri' : ''}
            icon="play"
            disabled={connected < MIN_PLAYERS}
            onClick={() => props.game.send({ type: 'start' })}
          >
            {LOBBY_TEXT.START}
          </Button>
        ) : (
          host && (
            <Chip tone="warn" big icon="clock">
              {LOBBY_TEXT.waitingFor(host.name)}
            </Chip>
          )
        )}
      </div>
    </Stage>
  );
}

function PlayerSlot(props: {
  player?: PlayerView;
  isMe: boolean;
  isHost: boolean;
  compact: boolean;
}) {
  const p = props.player;
  const style = props.compact ? { height: 64, marginBottom: 6 } : undefined;
  if (!p) {
    return (
      <div className="slot empty" style={style}>
        <span className="av" />
        <span className="nm">{LOBBY_TEXT.WAITING}</span>
        <span />
      </div>
    );
  }
  return (
    <div className={`slot ${props.isMe ? 'me' : ''}`} style={style}>
      <span className="av">
        <Gota
          color={p.color}
          accessory={p.accessory}
          skin={skinOf(p.skin)}
          scale={props.compact ? 1.6 : 2}
          portrait
        />
      </span>
      <span className="nm">
        <span className="fit" title={p.name}>
          {p.name}
        </span>
        {props.isMe && <span>{LOBBY_TEXT.YOU}</span>}
        {props.isHost && <Icon name="crown" palette="amber" size={24} />}
        <small className="muted" style={{ fontSize: '.7em' }}>
          {colorName(p.color)}
        </small>
      </span>
      {props.isHost ? (
        <Chip tone="info">{LOBBY_TEXT.HOST}</Chip>
      ) : p.connected ? (
        <Chip tone="ok">{LOBBY_TEXT.READY}</Chip>
      ) : (
        <Chip tone="bad">{LOBBY_TEXT.OFFLINE}</Chip>
      )}
    </div>
  );
}
