import { useEffect, useRef, useState } from 'react';
import { Stage } from '../ui/Stage';
import {
  Gota,
  SERVER_COLORS,
  colorName,
  normalizeColor,
  ACCESSORIES,
  accessoryName,
} from '../ui/Gota';
import { HintBar } from '../ui/kit';
import { api } from '../api';
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
import { LOBBY_TEXT, MENU_TEXT } from '../texts';
import { BACKGROUNDS } from './backgrounds';
import { useGame } from './game/useGame';
import { FEATURES } from '../features';
import '../styles/lobby.css';

const NO_ACCESSORY = 'none';
const MAX_SLOTS = 10;
const MIN_PLAYERS = 2;
const TWO_IMPOSTORS_FROM = 7;

function equippedSummary(
  skin: string,
  color: string,
  accessory: string,
): string {
  const acc =
    accessory === NO_ACCESSORY
      ? LOBBY_TEXT.NO_ACCESSORY
      : accessoryName(accessory);
  return `${skin}  |  ${colorName(color)}  |  ${acc}`;
}

// Lobby: sala de espera unificada con distribución balanceada y separadores.
export function Lobby(props: {
  game: GameSession;
  onLeave: () => void;
  onStarted: () => void;
}) {
  const state = useGame(props.game);
  const data = session.loadSession();
  const [copied, setCopied] = useState(false);
  const [shop, setShop] = useState<ShopResponse | null>(null);
  const prefsApplied = useRef(false);
  const snap = state.snapshot;

  const [pickedColor, setPickedColor] = useState<string | null>(null);
  const [pickedSkin, setPickedSkin] = useState<Skin | null>(null);
  const [pickedAccessory, setPickedAccessory] = useState<string | null>(null);

  useEffect(() => {
    if (snap && snap.phase !== 'LOBBY') props.onStarted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap?.phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') props.onLeave();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [props]);

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
  const host = players[0];
  const isHost = Boolean(data?.isCreator);
  const connected = players.filter((p) => p.connected).length;

  const myColor =
    pickedColor ??
    (meView?.color ? normalizeColor(meView.color) : null) ??
    (loadCosmetics().color ? normalizeColor(loadCosmetics().color) : null) ??
    SERVER_COLORS[1];

  const mySkin =
    pickedSkin ??
    (meView?.skin ? skinOf(meView.skin) : null) ??
    loadCosmetics().skin ??
    SKIN_JIMENA;

  const myAccessory =
    pickedAccessory ??
    (meView?.accessory !== undefined ? meView.accessory : null) ??
    loadCosmetics().accessory ??
    NO_ACCESSORY;

  const owned = ownedIds(shop);
  const gotaOwned = owned.has(gotaItemId(myColor));

  useEffect(() => {
    if (prefsApplied.current || !meView || !shop) return;
    prefsApplied.current = true;
    const prefs = loadCosmetics();
    const wanted = prefs.color.toLowerCase();
    const taken = players.some(
      (p) =>
        p.id !== meView.id &&
        p.connected &&
        p.color.toLowerCase() === wanted,
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
    setPickedSkin(skin);
    props.game.send({ type: 'pickSkin', skin });
    saveCosmetics({ ...loadCosmetics(), skin });
  };

  const pickAccessory = (id: string) => {
    setPickedAccessory(id);
    props.game.send({ type: 'pickAccessory', accessory: id });
    saveCosmetics({
      ...loadCosmetics(),
      accessory: id === NO_ACCESSORY ? '' : id,
    });
  };

  const pickColor = (color: string) => {
    const norm = normalizeColor(color);
    setPickedColor(norm);
    props.game.send({ type: 'pickColor', color: norm });
    saveCosmetics({ ...loadCosmetics(), color: norm });
  };

  const code = data?.roomCode ?? '----';
  const impostors = players.length >= TWO_IMPOSTORS_FROM ? 2 : 1;
  const skinDisplay =
    mySkin === SKIN_GOTA
      ? LOBBY_TEXT.CHARACTER_GOTA
      : LOBBY_TEXT.CHARACTER_JIMENA;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sin permiso de portapapeles
    }
  };

  return (
    <Stage className="scr-lobby" background={BACKGROUNDS.mapBlur}>
      <div className="lobby-vignette" />

      {/* BARRA SUPERIOR INTEGRADA */}
      <header className="lobby-header">
        <button
          type="button"
          className="lobby-exit-btn"
          onClick={props.onLeave}
        >
          {LOBBY_TEXT.LEAVE}
        </button>

        <div
          className="lobby-code-badge"
          onClick={copy}
          role="button"
          tabIndex={0}
          title={copied ? LOBBY_TEXT.COPIED : LOBBY_TEXT.COPY}
        >
          <span className="lobby-code-lbl">{LOBBY_TEXT.ROOM_CODE}:</span>
          <span className="lobby-code-val">{code}</span>
          <span className="lobby-code-action">
            {copied ? LOBBY_TEXT.COPIED : LOBBY_TEXT.COPY}
          </span>
        </div>

        <div className="lobby-header-meta">
          <span>{gameMap.name}</span>
          <span className="lobby-meta-dot">·</span>
          <span>{connected} / {MAX_SLOTS}</span>
        </div>
      </header>

      {/* CUERPO UNIFICADO DE LA PANTALLA */}
      <main className="lobby-stage-content">
        {/* COLUMNA IZQUIERDA: TU PERSONAJE */}
        <section className="lobby-hero-col">
          <div className="lobby-char-pedestal">
            <div className="lobby-char-shadow" />
            <div className="lobby-char-figure">
              <Gota
                color={myColor}
                accessory={myAccessory}
                skin={mySkin}
                scale={3.0}
                animate
              />
            </div>
            <div className="lobby-char-name-tag">
              {data?.username} {LOBBY_TEXT.YOU}
            </div>
            <div className="lobby-char-desc">
              {equippedSummary(skinDisplay, myColor, myAccessory)}
            </div>
          </div>

          <div className="lobby-section-sep" />

          <div className="lobby-controls-flow">
            {/* Selector de personaje */}
            <div className="lobby-control-group">
              <span className="lobby-control-title">
                {LOBBY_TEXT.CHARACTER}
              </span>
              <div className="lobby-skin-options">
                <button
                  type="button"
                  className={`lobby-pill-opt ${
                    mySkin === SKIN_JIMENA ? 'active' : ''
                  }`}
                  onClick={() => pickSkin(SKIN_JIMENA)}
                >
                  {LOBBY_TEXT.CHARACTER_JIMENA}
                </button>
                <button
                  type="button"
                  className={`lobby-pill-opt ${
                    mySkin === SKIN_GOTA ? 'active' : ''
                  }`}
                  disabled={!gotaOwned}
                  title={
                    gotaOwned
                      ? LOBBY_TEXT.CHARACTER_GOTA
                      : LOBBY_TEXT.lockedHint(LOBBY_TEXT.CHARACTER_GOTA)
                  }
                  onClick={() => pickSkin(SKIN_GOTA)}
                >
                  {LOBBY_TEXT.CHARACTER_GOTA}
                  {!gotaOwned ? ' (Tienda)' : ''}
                </button>
              </div>
            </div>

            <div className="lobby-section-sep" />

            {/* Selector de colores */}
            <div className="lobby-control-group">
              <span className="lobby-control-title">
                {LOBBY_TEXT.COLOR} · {colorName(myColor)}
              </span>
              <div className="lobby-color-row">
                {SERVER_COLORS.map((c) => {
                  const isMine = c === myColor.toLowerCase();
                  const isTaken = players.some(
                    (p) =>
                      p.id !== meView?.id &&
                      p.connected &&
                      p.color.toLowerCase() === c,
                  );
                  return (
                    <button
                      key={c}
                      type="button"
                      className={`lobby-color-dot ${
                        isMine ? 'active' : ''
                      } ${isTaken ? 'taken' : ''}`}
                      style={{ background: c }}
                      disabled={isTaken && !isMine}
                      title={colorName(c)}
                      onClick={() => pickColor(c)}
                    />
                  );
                })}
              </div>
            </div>

            <div className="lobby-section-sep" />

            {/* Selector de accesorios */}
            {FEATURES.accessoryPicker && (
              <div className="lobby-control-group">
                <span className="lobby-control-title">
                  {LOBBY_TEXT.ACCESSORY}
                </span>
                <div className="lobby-acc-row">
                  <button
                    type="button"
                    className={`lobby-acc-item no-acc ${
                      myAccessory === NO_ACCESSORY ? 'active' : ''
                    }`}
                    title={LOBBY_TEXT.NO_ACCESSORY}
                    onClick={() => pickAccessory(NO_ACCESSORY)}
                  >
                    <span className="lobby-no-acc-glyph">✕</span>
                  </button>
                  {ACCESSORIES.map((a) => {
                    const isOwned = owned.has(a.id);
                    const isActive = myAccessory === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        className={`lobby-acc-item ${
                          isActive ? 'active' : ''
                        } ${!isOwned ? 'locked' : ''}`}
                        disabled={!isOwned}
                        title={
                          isOwned
                            ? a.name
                            : LOBBY_TEXT.lockedHint(a.name)
                        }
                        onClick={() => pickAccessory(a.id)}
                      >
                        <Gota
                          color={myColor}
                          accessory={a.id}
                          skin={mySkin}
                          scale={1.25}
                          portrait
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* DIVISOR VERTICAL CENTRAL */}
        <div className="lobby-v-divider" />

        {/* COLUMNA DERECHA: SALA Y JUGADORES */}
        <section className="lobby-players-col">
          <div>
            <div className="lobby-players-title">
              <span>{LOBBY_TEXT.PLAYERS}</span>
              <span className="lobby-players-count">
                {LOBBY_TEXT.connected(connected)}
              </span>
            </div>

            <div className="lobby-roster-grid">
              {Array.from({ length: MAX_SLOTS }).map((_, i) => {
                const p = players[i];
                if (!p) {
                  return (
                    <div key={`empty-${i}`} className="lobby-player-card is-empty">
                      <span className="lobby-player-sub">
                        {LOBBY_TEXT.WAITING}
                      </span>
                    </div>
                  );
                }

                const isMe = p.id === data?.playerId;
                const isRoomHost = p === host;
                const displayColor =
                  isMe && pickedColor ? pickedColor : p.color;
                const displaySkin =
                  isMe && pickedSkin ? pickedSkin : skinOf(p.skin);
                const displayAcc =
                  isMe && pickedAccessory !== null
                    ? pickedAccessory
                    : p.accessory;

                return (
                  <div
                    key={p.id}
                    className={`lobby-player-card ${isMe ? 'is-me' : ''}`}
                  >
                    <div className="lobby-player-avatar">
                      <Gota
                        color={displayColor}
                        accessory={displayAcc}
                        skin={displaySkin}
                        scale={1.45}
                        portrait
                      />
                    </div>
                    <div className="lobby-player-card-sep" />
                    <div className="lobby-player-info">
                      <div className="lobby-player-name-row">
                        <span className="lobby-player-name" title={p.name}>
                          {p.name}
                        </span>
                        {isMe && (
                          <span className="lobby-player-tag">
                            {LOBBY_TEXT.YOU}
                          </span>
                        )}
                      </div>
                      <span className="lobby-player-sub">
                        {colorName(displayColor)}
                      </span>
                    </div>
                    <span
                      className={`lobby-player-badge ${
                        isRoomHost ? 'host' : ''
                      }`}
                    >
                      {isRoomHost
                        ? LOBBY_TEXT.HOST
                        : p.connected
                          ? LOBBY_TEXT.READY
                          : LOBBY_TEXT.OFFLINE}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lobby-action-footer">
            <div className="lobby-match-badges">
              <span className="lobby-match-badge-item">
                {gameMap.name}
              </span>
              <span className="lobby-match-badge-sep">|</span>
              <span className="lobby-match-badge-item">
                {LOBBY_TEXT.impostors(impostors)}
              </span>
              <span className="lobby-match-badge-sep">|</span>
              <span className="lobby-match-badge-item">
                {LOBBY_TEXT.TASKS}
              </span>
              <span className="lobby-match-badge-sep">|</span>
              <span className="lobby-match-badge-item">
                {LOBBY_TEXT.DURATION}
              </span>
            </div>

            {isHost && connected < MIN_PLAYERS && (
              <div className="lobby-min-players-alert">
                {LOBBY_TEXT.MIN_PLAYERS}
              </div>
            )}

            {isHost ? (
              <button
                type="button"
                className="lobby-main-cta"
                disabled={connected < MIN_PLAYERS}
                onClick={() => props.game.send({ type: 'start' })}
              >
                {LOBBY_TEXT.START}
              </button>
            ) : (
              host && (
                <div className="lobby-guest-notice">
                  {LOBBY_TEXT.waitingFor(host.name)}
                </div>
              )
            )}
          </div>
        </section>
      </main>

      <HintBar
        hints={[
          ['Tab', MENU_TEXT.HINT_CHOOSE],
          ['Enter', MENU_TEXT.HINT_ACCEPT],
          ['Esc', LOBBY_TEXT.LEAVE],
        ]}
      />
    </Stage>
  );
}
