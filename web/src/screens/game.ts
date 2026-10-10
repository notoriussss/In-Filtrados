import type { PlayerView } from '@in-filtrados/messages';
import { gameMap } from '../map';
import { type Camera, clampCamera, createCamera } from '../canvas/camera';
import { renderMap } from '../canvas/renderMap';
import { renderPlayers } from '../canvas/renderPlayers';
import { connect, disconnect } from '../net/socket';
import { session } from '../session';

let animationFrame: number;

export function mountGame(
  show: (screen: 'login' | 'lobby' | 'game') => void
): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const ctx = canvas.getContext('2d')!;
  let camera: Camera = createCamera(
    gameMap,
    window.innerWidth,
    window.innerHeight,
  );

  const currentSession = session.loadSession();
  if (!currentSession || !currentSession.matchId) {
    show('login');
    return;
  }

  let players: PlayerView[] = [];
  const meId = currentSession.playerId;
  
  const send = connect(
    currentSession.token,
    currentSession.matchId,
    (msg) => {
      if (msg.type === 'snapshot') {
        players = msg.players;
      } else if (msg.type === 'error') {
        console.warn(msg.code, msg.message);
      }
    }
  );

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    camera = clampCamera(
      {
        ...camera,
        viewWidth: window.innerWidth,
        viewHeight: window.innerHeight,
      },
      gameMap,
    );
  }

  const pressed = new Set<string>();
  const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  let lastDx = 0;
  let lastDy = 0;

  function sendDirection(): void {
    const right = Number(pressed.has('ArrowRight'));
    const left = Number(pressed.has('ArrowLeft'));
    const down = Number(pressed.has('ArrowDown'));
    const up = Number(pressed.has('ArrowUp'));
    const dx = (right - left) as -1 | 0 | 1;
    const dy = (down - up) as -1 | 0 | 1;

    if (dx === lastDx && dy === lastDy) return;
    lastDx = dx;
    lastDy = dy;
    send({ type: 'move', dx, dy });
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!ARROWS.has(e.key)) return;
    e.preventDefault();
    pressed.add(e.key);
    sendDirection();
  }

  function onKeyUp(e: KeyboardEvent) {
    pressed.delete(e.key);
    sendDirection();
  }

  function onBlur() {
    pressed.clear();
    sendDirection();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', resize);

  function frame(): void {
    const me = players.find((p) => p.id === meId);
    if (me) {
      camera = clampCamera({ ...camera, x: me.x, y: me.y }, gameMap);
    }

    ctx.fillStyle = '#1b2a33';
    ctx.fillRect(0, 0, camera.viewWidth, camera.viewHeight);
    renderMap(ctx, gameMap, camera);
    renderPlayers(ctx, players, camera, meId);
    animationFrame = requestAnimationFrame(frame);
  }

  resize();
  animationFrame = requestAnimationFrame(frame);

  // Guardamos las funciones de limpieza en el elemento canvas como hack temporal 
  // para poder limpiar los event listeners en unmountGame.
  (canvas as any)._cleanup = () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('resize', resize);
    cancelAnimationFrame(animationFrame);
    disconnect();
  };
}

export function unmountGame(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  if (canvas && (canvas as any)._cleanup) {
    (canvas as any)._cleanup();
    delete (canvas as any)._cleanup;
  }
}
