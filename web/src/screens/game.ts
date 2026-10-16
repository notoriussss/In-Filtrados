import type {
  OilDrop,
  PlayerView,
  Snapshot,
  Winner,
} from '@in-filtrados/messages';
import { gameMap } from '../map';
import { type Camera, clampCamera, createCamera } from '../canvas/camera';
import {
  renderFixArrows,
  renderFixPoints,
  renderMap,
  type StationMarks,
} from '../canvas/renderMap';
import { renderPlayers } from '../canvas/renderPlayers';
import { renderOilDrops } from '../canvas/renderOilDrops';
import { renderActivities } from '../canvas/activityFx';
import { PlayerAnimator } from '../canvas/playerAnim';
import { preloadSprites } from '../canvas/sprites';
import {
  approach,
  canSee,
  renderDarkness,
  visiblePlayer,
  visionRadius,
} from '../canvas/vision';
import { emergencyBanner, sabotageButtons } from '../emergency';
import {
  renderHoldProgress,
  renderTanks,
} from '../canvas/renderTanks';
import {
  type Action,
  HoldAction,
  actionMessage,
  contextAction,
  holdDuration,
  tankRose,
} from '../actions';
import { mountHud } from '../hud';
import {
  closeGameSocket,
  openGameSocket,
  type SocketStatus,
} from '../net/socket';
import { Interpolator } from '../net/interpolation';
import { DirectionInput, isTyping } from '../input';
import { session } from '../session';
import { api, type MeResponse } from '../api';
import { type MeetingPanel, mountMeetingPanel } from './meeting';
import { type EndPanelHandle, mountEndPanel } from './matchEnd';
import { pauseMessage } from '../pause';
import { ChatQueue } from '../net/chatQueue';
import { type TaskListPanel, mountTaskList } from '../tasks/taskList';
import { TaskSession } from '../tasks/taskSession';
import { mountMinigame } from '../tasks/minigameView';
import {
  CONNECTION_MESSAGES,
  ERROR_CODES,
  ERROR_MESSAGES,
  GAME_RULES,
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
  // Sprites de Jimena y su animación de caminar.
  preloadSprites();
  const animator = new PlayerAnimator();
  // S3-05: radio de visión dibujado (se acerca al real poco a poco).
  let shownRadius: number | null = null;
  let lastFrameAt = performance.now();
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

  // S2-11: lista de misiones y minijuegos.
  const taskList: TaskListPanel = mountTaskList(
    document.getElementById('task-list')!,
  );
  const taskRoot = document.getElementById('task-overlay')!;
  const tasks = new TaskSession({
    stations: gameMap.stations,
    send: (msg) => send(msg),
    me: () =>
      interpolator
        .playersAt(performance.now())
        .find((p) => p.id === meId),
    snapshot: () => lastSnapshot,
    mount: (type, opts) => mountMinigame(taskRoot, type, opts),
    // Con el minijuego abierto el jugador se queda quieto.
    onOpen: () => send({ type: 'move', dx: 0, dy: 0 }),
    onClose: () => input.clear(),
    now: () => performance.now(),
  });

  // S2-09: acción contextual (tecla E o botón), la acción en curso que
  // exige quedarse quieto y el HUD con el embalse y el aviso del tanque.
  let currentAction: Action | null = null;
  let hold: HoldAction | null = null;
  // El cooldown vive solo aquí: si el impostor recarga, el botón sale
  // activo y match rechaza la acción hasta que pasen los 20 s.
  let contaminateReadyAt = 0;
  // Tanques que ya tuvieron reunión. TankView no lo dice todavía y esto
  // se pierde al recargar.
  const reportedTanks = new Set<number>();
  const triggerAction = () => {
    const action = currentAction;
    if (!action || !action.enabled || hold) return;
    const { dx, dy } = input.current();
    if (dx !== 0 || dy !== 0) return; // match exige estar quieto
    if (action.kind === 'task') {
      tasks.start();
      return;
    }
    send(actionMessage(action));
    if (holdDuration(action.kind) > 0) {
      hold = new HoldAction(action, performance.now());
    }
  };
  const finishHold = (done: HoldAction, now: number) => {
    const { action } = done;
    if (action.kind === 'contaminate') {
      contaminateReadyAt = now + GAME_RULES.CONTAMINATE_COOLDOWN_MS;
    }
  };
  const hud = mountHud(triggerAction, (kind) => {
    send({ type: 'sabotage', kind });
  });
  const onActionKey = (e: KeyboardEvent) => {
    if (e.code !== 'KeyE' || e.repeat || isTyping(e.target)) return;
    if (tasks.isOpen()) return;
    e.preventDefault();
    triggerAction();
  };
  window.addEventListener('keydown', onActionKey);

  // S3-04: el chat escrito sin conexión espera aquí hasta salir.
  const chatQueue = new ChatQueue((msg) => send(msg));

  const showMeeting = (on: boolean) => {
    if (on) hud.hideTankAlert();
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
    hud.hideTankAlert();
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
      // S2-09: avisa al dueño cuando su tanque sube, sin decir quién.
      if (
        lastSnapshot &&
        tankRose(lastSnapshot.tanks, msg.tanks, meId, msg.myRole)
      ) {
        hud.showTankAlert();
      }
      lastSnapshot = msg;
      if (msg.meeting) reportedTanks.add(msg.meeting.tankSlot);
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
      chatQueue.onSnapshot(msg, performance.now());
      taskList.update(msg);
      tasks.onSnapshot(msg);
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
    if (tasks.isOpen()) return; // S2-11: quieto durante el minijuego
    send({ type: 'move', dx, dy });
  });
  const detachInput = input.attach(window);
  const detachTasks = tasks.attach(window);
  window.addEventListener('resize', resize);

  function frame(): void {
    const now = performance.now();
    const players = interpolator.playersAt(now);
    const me = players.find((p) => p.id === meId);
    if (me) {
      camera = clampCamera({ ...camera, x: me.x, y: me.y }, gameMap);
    }

    const dt = now - lastFrameAt;
    lastFrameAt = now;
    const snap = lastSnapshot;
    const emergency =
      snap && snap.phase === 'PLAYING' ? snap.emergency : null;
    // S3-05: visión limitada; los fantasmas ven todo.
    const radius = visionRadius(snap, me);
    shownRadius = approach(shownRadius, radius, dt);
    const visible = (p: PlayerView) =>
      visiblePlayer(me, p, shownRadius);

    ctx.fillStyle = '#0b1610';
    ctx.fillRect(0, 0, camera.viewWidth, camera.viewHeight);
    renderMap(ctx, gameMap, camera, stationMarks(snap, now), now);
    renderFixPoints(ctx, gameMap, camera, emergency, now);
    const tick = interpolator.tickAt(now);
    if (tick !== null) {
      const seen = me
        ? oilDrops.filter((d) => canSee(me, d.x, d.y, shownRadius))
        : oilDrops;
      renderOilDrops(ctx, seen, camera, tick);
    }
    if (snap) {
      renderTanks(ctx, snap.tanks, players, gameMap, camera);
    }
    renderPlayers(ctx, players, camera, meId, {
      animator,
      now,
      visible,
    });
    renderActivities(ctx, players, camera, now, visible);
    renderDarkness(ctx, camera, me, radius, shownRadius);
    renderFixArrows(
      ctx,
      gameMap,
      camera,
      emergency,
      me,
      shownRadius ?? Math.min(camera.viewWidth, camera.viewHeight) / 2,
    );
    const serverTick = snap?.tick ?? 0;
    hud.setEmergency(emergencyBanner(snap, gameMap, serverTick));
    hud.setSabotage(
      matchDown || snap?.paused ? null : sabotageButtons(snap, serverTick),
    );
    tasks.frame();
    updateAction(me, now);
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

  // updateAction elige el botón de acción y avanza la acción en curso:
  // se cancela si el jugador se mueve, se aleja o la partida se detiene.
  function updateAction(me: PlayerView | undefined, now: number): void {
    const snap = lastSnapshot;
    const playing =
      snap !== null &&
      snap.phase === 'PLAYING' &&
      !snap.paused &&
      !matchDown &&
      !tasks.isOpen();
    currentAction =
      playing && me
        ? contextAction(
            me,
            snap.myRole,
            snap.tanks,
            gameMap,
            now,
            contaminateReadyAt,
            reportedTanks,
            snap.myTasks,
            snap.emergency,
          )
        : null;
    hud.setAction(currentAction);
    hud.setReservoir(
      snap && snap.phase === 'PLAYING' ? snap.reservoir : null,
    );

    if (!hold) return;
    const { dx, dy } = input.current();
    if (dx !== 0 || dy !== 0 || !hold.sameTarget(currentAction)) {
      hold = null;
      return;
    }
    if (hold.done(now)) {
      finishHold(hold, now);
      hold = null;
      return;
    }
    if (me) {
      // La tubería no tiene fin propio: un arco que gira mientras se
      // espera al otro extremo.
      const waiting = hold.duration === Infinity;
      renderHoldProgress(
        ctx,
        camera,
        me.x,
        me.y,
        waiting ? 0.25 : hold.progress(now),
        waiting ? now / 300 : 0,
      );
    }
  }

  resize();
  animationFrame = requestAnimationFrame(frame);

  // Guardamos las funciones de limpieza en canvas como hack temporal 
  // para poder limpiar los event listeners en unmountGame.
  (canvas as any)._cleanup = () => {
    detachInput();
    detachTasks();
    tasks.destroy();
    taskList.hide();
    window.removeEventListener('keydown', onActionKey);
    hud.destroy();
    window.removeEventListener('resize', resize);
    cancelAnimationFrame(animationFrame);
    closeGameSocket();
    showMeeting(false);
    pauseBanner.hidden = true;
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

// stationMarks: estaciones propias pendientes y hechas para el mapa
// (S2-11). Fuera de PLAYING el mapa se dibuja sin marcas.
function stationMarks(
  snap: Snapshot | null,
  now: number,
): StationMarks | undefined {
  if (!snap || snap.phase !== 'PLAYING' || snap.myTasks.length === 0) {
    return undefined;
  }
  const pending = new Set<string>();
  const done = new Set<string>();
  for (const t of snap.myTasks) (t.done ? done : pending).add(t.stationId);
  return { pending, done, now };
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
