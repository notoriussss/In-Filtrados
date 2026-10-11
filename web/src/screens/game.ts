import type {
  OilDrop,
  PlayerView, // TEMP S2-12
  Snapshot, // TEMP S2-12
} from '@in-filtrados/messages';
import { gameMap } from '../map';
import { type Camera, clampCamera, createCamera } from '../canvas/camera';
import { renderMap } from '../canvas/renderMap';
import { renderPlayers } from '../canvas/renderPlayers';
import { renderOilDrops } from '../canvas/renderOilDrops';
import {
  closeGameSocket,
  openGameSocket,
  type SocketStatus,
} from '../net/socket';
import { Interpolator } from '../net/interpolation';
import { DirectionInput } from '../input';
import { session } from '../session';
import { // TEMP S2-12
  attachDebugContaminate, // TEMP S2-12
  renderDebugHint, // TEMP S2-12
} from '../debugContaminate'; // TEMP S2-12
import {
  CONNECTION_MESSAGES,
  ERROR_CODES,
  ERROR_MESSAGES,
} from '../constants';

let animationFrame: number;

export function mountGame(
  show: (
    screen: 'login' | 'register' | 'lobby' | 'game',
    initialError?: string,
  ) => void,
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
  let oilDrops: OilDrop[] = []; // S2-12: rastro del impostor
  let lastMe: PlayerView | undefined; // TEMP S2-12
  let lastRole = ''; // TEMP S2-12
  let lastSnap: Snapshot | null = null; // TEMP S2-12

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
      oilDrops = msg.oilDrops;
      lastSnap = msg; // TEMP S2-12
      if (msg.myRole !== lastRole) { // TEMP S2-12
        lastRole = msg.myRole; // TEMP S2-12
        console.info(`[TEMP] mi rol: ${lastRole}`); // TEMP S2-12
      } // TEMP S2-12
    } else if (msg.type === 'error') {
      if (msg.code === ERROR_CODES.MATCH_NOT_FOUND) {
        session.saveSession({
          ...currentSession,
          matchId: '',
          roomCode: undefined,
          isCreator: false,
        });
        show('lobby', ERROR_MESSAGES.MATCH_NOT_FOUND);
        return;
      }
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
  const detachDebug = attachDebugContaminate( // TEMP S2-12
    window, // TEMP S2-12
    () => lastMe, // TEMP S2-12
    () => lastSnap, // TEMP S2-12
    meId, // TEMP S2-12
    send, // TEMP S2-12
  ); // TEMP S2-12
  window.addEventListener('resize', resize);

  function frame(): void {
    const now = performance.now();
    const players = interpolator.playersAt(now);
    const me = players.find((p) => p.id === meId);
    lastMe = me; // TEMP S2-12
    if (me) {
      camera = clampCamera({ ...camera, x: me.x, y: me.y }, gameMap);
    }

    ctx.fillStyle = '#1b2a33';
    ctx.fillRect(0, 0, camera.viewWidth, camera.viewHeight);
    renderMap(ctx, gameMap, camera);
    const tick = interpolator.tickAt(now);
    if (tick !== null) renderOilDrops(ctx, oilDrops, camera, tick);
    renderPlayers(ctx, players, camera, meId);
    renderDebugHint(ctx, lastSnap, me, camera); // TEMP S2-12
    if (status.state === 'reconnecting') {
      renderOverlayMessage(
        ctx,
        camera,
        CONNECTION_MESSAGES.reconnecting(status.attempt),
      );
    } else if (status.state === 'replaced') {
      renderOverlayMessage(
        ctx,
        camera,
        CONNECTION_MESSAGES.SESSION_REPLACED,
      );
    }
    animationFrame = requestAnimationFrame(frame);
  }

  resize();
  animationFrame = requestAnimationFrame(frame);

  // Guardamos las funciones de limpieza en canvas como hack temporal 
  // para poder limpiar los event listeners en unmountGame.
  (canvas as any)._cleanup = () => {
    detachInput();
    detachDebug(); // TEMP S2-12
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

// Aviso sobre el canvas mientras el socket reconecta o es reemplazado (S1-20).
function renderOverlayMessage(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  text: string,
): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, camera.viewWidth, camera.viewHeight);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    text,
    camera.viewWidth / 2,
    camera.viewHeight / 2,
  );
}
