import { useEffect, useState } from 'react';
import { Stage } from '../ui/Stage';
import { Gota } from '../ui/Gota';
import { type MapAssets, loadMapAssets } from '../game/render/assets';
import { preloadSprites } from '../game/render/sprites';
import { BOOT_TEXT, APP_TEXT } from '../texts';
import { BACKGROUNDS } from './backgrounds';
import '../styles/boot.css';

const FONTS = ['16px "Press Start 2P"', '16px VT323', '16px Silkscreen'];

// Boot: pantalla de carga minimalista y sobria (descarga fuentes, mapa y personajes).
export function Boot(props: { onDone: (assets: MapAssets) => void }) {
  const [progress, setProgress] = useState(0);
  const [, setFonts] = useState(false);
  const [, setMap] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    preloadSprites();
    const fontsReady = Promise.all(
      FONTS.map((f) => document.fonts.load(f)),
    ).then(() => alive && setFonts(true));
    const mapReady = loadMapAssets((p) => alive && setProgress(p)).then((a) => {
      if (alive) setMap(true);
      return a;
    });
    Promise.all([fontsReady, mapReady])
      .then(([, a]) => {
        // Un instante para que se aprecie la barra completada antes de entrar.
        if (alive) setTimeout(() => alive && props.onDone(a), 300);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const pct = Math.round(progress * 100);

  return (
    <Stage className="scr-boot" background={BACKGROUNDS.hero}>
      <div className="boot-vignette" />

      <div className="boot-center">
        <div className="boot-logo">
          <div className="water-drop-badge">
            <Gota color="cyan" scale={3.5} view="front" animate />
          </div>
          <h1>
            <span className="a">{APP_TEXT.TITLE_A}</span>
            <span className="b">{APP_TEXT.TITLE_B}</span>
          </h1>
          <div className="boot-rule" aria-hidden="true">
            <i />
          </div>
          <p className="boot-sub">
            {APP_TEXT.REDUCE} <b>·</b>
            {APP_TEXT.REUSE} <b>·</b>
            {APP_TEXT.RECYCLE}
          </p>
        </div>

        <div className="boot-loader">
          <div className="boot-bar-track">
            <div
              className={`boot-bar-fill ${failed ? 'bad' : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="boot-status">
            <span className="boot-label">
              {failed ? BOOT_TEXT.FAILED : BOOT_TEXT.LOADING}
            </span>
            <span className="boot-pct">{pct}%</span>
          </div>

          {failed && (
            <button
              type="button"
              className="boot-retry-btn"
              onClick={() => setAttempt((n) => n + 1)}
            >
              {BOOT_TEXT.RETRY}
            </button>
          )}
        </div>
      </div>
    </Stage>
  );
}
