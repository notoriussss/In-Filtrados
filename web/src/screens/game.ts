import type {
  OilDrop,
  PlayerView,
  Snapshot,
  Winner,
} from '@in-filtrados/messages';
import { gameMap } from '../map';
import { type Camera, clampCamera, createCamera } from '../canvas/camera';
import { renderMap } from '../canvas/renderMap';
import { renderTanks } from '../canvas/renderTanks';
import { renderPlayers } from '../canvas/renderPlayers';
import { renderOilDrops } from '../canvas/renderOilDrops';
import {
  closeGameSocket,
  openGameSocket,
  type SocketStatus,
} from '../net/socket';
import { Interpolator } from '../net/interpolation';
import { DirectionInput } from '../input';
import { ActionKey } from '../action';
import { session } from '../session';
import { api, type MeResponse } from '../api';
import { type MeetingPanel, mountMeetingPanel } from './meeting';
import { type EndPanelHandle, mountEndPanel } from './matchEnd';
import { pauseMessage } from '../pause';
import { ownTankRose, TANK_ALERT_MS } from '../tankAlert';
import { ChatQueue } from '../net/chatQueue';
import {
  CONNECTION_MESSAGES,
  ERROR_CODES,
  ERROR_MESSAGES,
  RESERVOIR_TEXT,
  TANK_TEXT,
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

  // S2-10: panel de la reunión y pantalla final, encima del canvas.
  const meetingRoot = document.getElementById('meeting-overlay')!;
  const endRoot = document.getElementById('end-overlay')!;
  let meetingPanel: MeetingPanel | null = null;
  let endPanel: EndPanelHandle | null = null;
  let winner: Winner | null = null;
  let impostorIds: string[] = [];
  let lastPlayers: PlayerView[] = [];
  // S3-02: aviso de pausa (alguien en gracia o match caído).
  const pauseBanner = document.getElementById('pause-banner')!;
  // S2-09: aviso al dueño cuando sube la contaminación de su tanque.
  const tankAlert = document.getElementById('tank-alert')!;
  let tankAlertTimer: number | null = null;
  const showTankAlert = () => {
    tankAlert.textContent = TANK_TEXT.OWN_TANK_ALERT;
    tankAlert.hidden = false;
    if (tankAlertTimer !== null) clearTimeout(tankAlertTimer);
    tankAlertTimer = window.setTimeout(() => {
      tankAlert.hidden = true;
      tankAlertTimer = null;
    }, TANK_ALERT_MS);
  };
  // S2-09: indicador de nivel del embalse.
  const reservoirRoot = document.getElementById('reservoir')!;
  const reservoirLabel = reservoirRoot.querySelector('.reservoir-label')!;
  const reservoirFill = reservoirRoot.querySelector<HTMLElement>(
    '.reservoir-fill',
  )!;
  let matchDown = false;
  let lastSnapshot: Snapshot | null = null;
  const updatePause = () => {
    const text = pauseMessage(lastSnapshot, matchDown);
    pauseBanner.hidden = text === null;
    if (text !== null && pauseBanner.textContent !== text) {
      pauseBanner.textContent = text;
    }
  };
  // Perfil al entrar: la pantalla final compara las monedas con este.
  let profileBefore: MeResponse | null = null;
  api.getMe(currentSession.token).then(
    (me) => (profileBefore = me),
    () => (profileBefore = null),
  );

  const backToLobby = () => {
    const latest = session.loadSession() ?? currentSession;
    session.saveSession({
      ...latest,
      matchId: '',
      roomCode: undefined,
      isCreator: false,
    });
    show('lobby');
  };

  // S3-04: el chat escrito sin conexión espera aquí hasta salir.
  const chatQueue = new ChatQueue((msg) => send(msg));

  const showMeeting = (on: boolean) => {
    meetingRoot.hidden = !on;
    if (on && !meetingPanel) {
      meetingPanel = mountMeetingPanel(
        meetingRoot,
        meId,
        (msg) => send(msg),
        (text) => {
          chatQueue.add(text, performance.now());
          if (lastSnapshot) {
            meetingPanel?.update(lastSnapshot, chatQueue.waiting());
          }
        },
      );
    } else if (!on && meetingPanel) {
      meetingPanel.destroy();
      meetingPanel = null;
    }
  };

  const showEnd = () => {
    if (endPanel) {
      endPanel.update(winner, impostorIds, lastPlayers);
      return;
    }
    endRoot.hidden = false;
    endPanel = mountEndPanel(endRoot, {
      winner,
      impostorIds,
      players: lastPlayers,
      token: currentSession.token,
      before: profileBefore,
      onBack: backToLobby,
    });
  };

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
    if (s.state !== 'connected') chatQueue.offline();
    status = s;
  });
  socket.onMessage((msg) => {
    if (msg.type === 'snapshot') {
      interpolator.push(msg.tick, msg.players, performance.now());
      oilDrops = msg.oilDrops;
      lastPlayers = msg.players;
      if (ownTankRose(lastSnapshot, msg, meId)) {
        showTankAlert();
      }
      lastSnapshot = msg;
      if (matchDown) {
        // match volvió (S3-02): retoma la dirección de las teclas.
        matchDown = false;
        const { dx, dy } = input.current();
        if (dx !== 0 || dy !== 0) send({ type: 'move', dx, dy });
      }
      updatePause();
      // S3-01: se entró directo a la partida, pero la sala sigue en
      // espera: se vuelve al lobby, que muestra el código y la lista.
      if (msg.phase === 'LOBBY') {
        show('lobby');
        return;
      }
      if (msg.phase === 'ENDED') {
        reservoirRoot.hidden = true;
      } else {
        reservoirRoot.hidden = false;
        const clamp = Math.min(Math.max(msg.reservoir, 0), 100);
        reservoirFill.style.width = `${clamp}%`;
        reservoirLabel.textContent = RESERVOIR_TEXT.label(msg.reservoir);
      }
      chatQueue.onSnapshot(msg, performance.now());
      showMeeting(msg.phase === 'MEETING');
      meetingPanel?.update(msg, chatQueue.waiting());
      if (msg.phase === 'ENDED') showEnd();
    } else if (msg.type === 'matchEnded') {
      winner = msg.winner;
      impostorIds = msg.impostorIds;
      if (endPanel) {
        endPanel.update(winner, impostorIds, lastPlayers);
      }
    } else if (msg.type === 'error') {
      if (msg.code === ERROR_CODES.SERVICE_UNAVAILABLE) {
        matchDown = true; // el gateway reabre Play solo (S3-02)
        chatQueue.offline();
        updatePause();
        return;
      }
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
  // Tecla E: acción contextual (reportar, contaminar o hacer tarea).
  const actionKey = new ActionKey(
    meId,
    () => lastPlayers.find((p) => p.id === meId),
    () => lastSnapshot,
    (msg) => send(msg),
  );
  const detachActionKey = actionKey.attach(window);
  window.addEventListener('resize', resize);

  function frame(): void {
    const now = performance.now();
    const players = interpolator.playersAt(now);
    const me = players.find((p) => p.id === meId);
    if (me) {
      camera = clampCamera({ ...camera, x: me.x, y: me.y }, gameMap);
    }

    ctx.fillStyle = '#1b2a33';
    ctx.fillRect(0, 0, camera.viewWidth, camera.viewHeight);
    renderMap(ctx, gameMap, camera);
    renderTanks(
      ctx,
      lastSnapshot?.tanks ?? [],
      gameMap.tanks,
      lastPlayers,
      camera,
    );
    const tick = interpolator.tickAt(now);
    if (tick !== null) renderOilDrops(ctx, oilDrops, camera, tick);
    renderPlayers(ctx, players, camera, meId);
    actionKey.render(ctx, camera);
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
    detachActionKey();
    window.removeEventListener('resize', resize);
    cancelAnimationFrame(animationFrame);
    closeGameSocket();
    showMeeting(false);
    pauseBanner.hidden = true;
    if (tankAlertTimer !== null) clearTimeout(tankAlertTimer);
    tankAlert.hidden = true;
    reservoirRoot.hidden = true;
    endPanel?.destroy();
    endPanel = null;
    endRoot.hidden = true;
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
