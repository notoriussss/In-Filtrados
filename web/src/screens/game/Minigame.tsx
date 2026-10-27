import { useEffect, useRef, useState } from 'react';
import type { StationType } from '../../map';
import { TASK_ICONS, Icon } from '../../ui/Icon';
import { Button, Gauge, Kbd } from '../../ui/kit';
import { BOARD } from '../../game/tasks/minigames';
import { createMinigame } from '../../game/tasks/minigames';
import { BOARD_SCALE, MinigameView } from '../../game/tasks/minigameDraw';
import { TASK_TEXT } from '../../constants';

// Minigame (S2-11): el minijuego de las 3R en un panel del kit. La
// lógica está en game/tasks/minigames.ts y el dibujo en minigameDraw.ts;
// aquí solo se conectan el canvas, los clics y el progreso. color es el
// del jugador: su personaje aparece en el tablero haciendo la tarea.
// El juego se elige por estación: cada estación tiene el suyo.
export function Minigame(props: {
  type: StationType;
  stationId: string;
  color?: string;
  accessory?: string;
  onComplete: () => void;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const game = createMinigame(props.type, props.stationId);
    const view = new MinigameView(
      game,
      props.color,
      undefined,
      props.accessory,
    );
    const toBoard = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) * BOARD.w) / r.width,
        y: ((e.clientY - r.top) * BOARD.h) / r.height,
      };
    };
    const down = (e: PointerEvent) => {
      e.preventDefault();
      cv.setPointerCapture(e.pointerId);
      game.pointerDown(toBoard(e));
    };
    const move = (e: PointerEvent) => game.pointerMove(toBoard(e));
    const up = () => game.pointerUp();
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    let done = false;
    let shown = 0;
    let last = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      game.step(Math.min(now - last, 100));
      last = now;
      view.frame(ctx, now);
      if (game.progress() !== shown) {
        shown = game.progress();
        setProgress(shown);
      }
      // Se avisa cuando ya se vio la celebración, no al instante.
      if (view.settled(now) && !done) {
        done = true;
        props.onComplete();
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.type, props.stationId]);

  const ic = TASK_ICONS[props.type];
  return (
    <section className="panel minigame">
      <header className="title-bar">
        <Icon name={ic.name} palette={ic.palette} />
        <h2 className="h2 grow" style={{ fontSize: 26 }}>
          {TASK_TEXT.STATION_TITLES[props.stationId] ??
            TASK_TEXT.GAME_TITLES[props.type]}
        </h2>
        <Button variant="sec" small onClick={props.onClose}>
          {TASK_TEXT.CLOSE} <Kbd>Esc</Kbd>
        </Button>
      </header>
      <canvas
        ref={canvas}
        width={BOARD.w * BOARD_SCALE}
        height={BOARD.h * BOARD_SCALE}
      />
      <Gauge value={progress} tone="leaf" />
    </section>
  );
}
