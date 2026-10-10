import { gameMap } from '../map';
import { type Camera, clampCamera, createCamera } from '../canvas/camera';
import { renderMap } from '../canvas/renderMap';
import { renderPlayers } from '../canvas/renderPlayers';
import {
  closeGameSocket,
  openGameSocket,
  type SocketStatus,
} from '../net/socket';
import { Interpolator } from '../net/interpolation';
import { DirectionInput } from '../input';
import { session } from '../session';
import { CONNECTION_MESSAGES } from '../constants';

let animationFrame: number;

export function mountGame(
  show: (screen: 'login' | 'register' | 'lobby' | 'game') => void
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

  const interpolator = new Interpolator();
  const meId = currentSession.playerId;

  let status: SocketStatus = { state: 'connected' };
  const socket = openGameSocket({
    token: currentSession.token,
    matchId: currentSession.matchId,
    onUnauthorized: () => show('login'),
  });
  socket.onStatus((s) => {
    // The server stops a player whose stream dropped: after reconnecting,
    // send again the direction of the keys still held.
    if (s.state === 'connected' && status.state === 'reconnecting') {
      const { dx, dy } = input.current();
      if (dx !== 0 || dy !== 0) send({ type: 'move', dx, dy });
    }
    status = s;
  });
  socket.onMessage((msg) => {
    if (msg.type === 'snapshot') {
      interpolator.push(msg.tick, msg.players, performance.now());
    } else if (msg.type === 'error') {
      console.warn(msg.code, msg.message);
    }
  });
  socket.connect();
  const send = socket.send.bind(socket);

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

  // S1-19: move goes out only when the direction changes.
  const input = new DirectionInput(({ dx, dy }) => {
    send({ type: 'move', dx, dy });
  });
  const detachInput = input.attach(window);
  window.addEventListener('resize', resize);

  function frame(): void {
    const players = interpolator.playersAt(performance.now());
    const me = players.find((p) => p.id === meId);
    if (me) {
      camera = clampCamera({ ...camera, x: me.x, y: me.y }, gameMap);
    }

    ctx.fillStyle = '#1b2a33';
    ctx.fillRect(0, 0, camera.viewWidth, camera.viewHeight);
    renderMap(ctx, gameMap, camera);
    renderPlayers(ctx, players, camera, meId);
    if (status.state === 'reconnecting') {
      renderReconnecting(ctx, camera, status.attempt);
    }
    animationFrame = requestAnimationFrame(frame);
  }

  resize();
  animationFrame = requestAnimationFrame(frame);

  // Guardamos las funciones de limpieza en canvas como hack temporal 
  // para poder limpiar los event listeners en unmountGame.
  (canvas as any)._cleanup = () => {
    detachInput();
    window.removeEventListener('resize', resize);
    cancelAnimationFrame(animationFrame);
    closeGameSocket();
  };
}

export function unmountGame(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  if (canvas && (canvas as any)._cleanup) {
    (canvas as any)._cleanup();
    delete (canvas as any)._cleanup;
  }
}

// Aviso sobre el canvas mientras el socket reconecta (S1-20).
function renderReconnecting(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  attempt: number,
): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, camera.viewWidth, camera.viewHeight);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    CONNECTION_MESSAGES.reconnecting(attempt),
    camera.viewWidth / 2,
    camera.viewHeight / 2,
  );
}
