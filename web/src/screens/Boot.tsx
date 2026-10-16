import { useEffect, useState } from 'react';
import { Stage } from '../ui/Stage';
import { Gota, SERVER_COLORS } from '../ui/Gota';
import { Button, Chip, Gauge, Pill } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { type MapAssets, loadMapAssets } from '../game/render/assets';
import { preloadSprites } from '../game/render/sprites';
import { BOOT_TEXT, APP_TEXT } from '../texts';
import { BACKGROUNDS } from './backgrounds';
import { Logo } from './Logo';

const FONTS = ['16px "Press Start 2P"', '16px VT323', '16px Silkscreen'];

// Boot (maqueta 01-carga): descarga fuentes, mapa y personajes y avisa
// cuando todo está listo.
export function Boot(props: { onDone: (assets: MapAssets) => void }) {
  const [progress, setProgress] = useState(0);
  const [fonts, setFonts] = useState(false);
  const [map, setMap] = useState(false);
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
        // Un instante para que se vea la barra completa.
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
    <Stage className="scr-boot" background={BACKGROUNDS.heroBlur}>
      <div className="shade dim" />
      <div className="shade v" />
      <Logo centered />
      <section
        className="panel"
        style={{
          left: 560,
          top: 540,
          width: 800,
          height: 310,
          padding: '26px 34px',
        }}
      >
        <div
          className="row"
          style={{ justifyContent: 'space-between', marginBottom: 14 }}
        >
          <span className="h3">
            {failed ? BOOT_TEXT.FAILED : BOOT_TEXT.LOADING}
          </span>
          <span className="num h3">{pct} %</span>
        </div>
        <Gauge value={progress} height={34} tone={failed ? 'bad' : ''} />
        <div
          className="row"
          style={{ marginTop: 20, gap: 12, flexWrap: 'wrap' }}
        >
          <Chip tone={fonts ? 'ok' : 'warn'} icon={fonts ? 'check' : 'clock'}>
            {BOOT_TEXT.STEP_FONTS}
          </Chip>
          <Chip tone={map ? 'ok' : 'warn'} icon={map ? 'check' : 'clock'}>
            {BOOT_TEXT.STEP_MAP}
          </Chip>
          <Chip tone="ok" icon="check">
            {BOOT_TEXT.STEP_CHARACTERS}
          </Chip>
          {failed && (
            <Button
              small
              variant="pri"
              onClick={() => setAttempt((n) => n + 1)}
            >
              {BOOT_TEXT.RETRY}
            </Button>
          )}
        </div>
        <div className="well" style={{ marginTop: 18, padding: '10px 16px' }}>
          <div className="row" style={{ gap: 14 }}>
            <Icon name="drop" palette="water" size={30} />
            <span className="small">
              <b>{BOOT_TEXT.TIP_TITLE}</b> · {BOOT_TEXT.TIP}
            </span>
          </div>
        </div>
      </section>
      <div className="dock" />
      <div className="walkers">
        {SERVER_COLORS.slice(0, 5).map((c, i) => (
          <div key={c}>
            <div
              className="shadow"
              style={{
                left: 342 + i * 300,
                top: 961 + (i % 2) * 25,
                width: 96,
                height: 22,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 330 + i * 300,
                top: 816 + (i % 2) * 25,
              }}
            >
              <Gota color={c} scale={3} view="side" walk animate />
            </div>
          </div>
        ))}
      </div>
      <Pill style={{ position: 'absolute', right: 50, bottom: 34 }}>
        {APP_TEXT.VERSION}
      </Pill>
    </Stage>
  );
}
