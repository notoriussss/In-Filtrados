import type {
  ClientMessage,
  EmergencyKind,
  PlayerView,
  Snapshot,
  Winner,
} from '@in-filtrados/messages';
import type { GameMap, StationType } from '../map';
import { GAME_RULES } from '../constants';
import {
  type GameSocket,
  type SocketStatus,
  openGameSocket,
  closeGameSocket,
} from '../net/socket';
import { Interpolator } from '../net/interpolation';
import { ChatQueue } from '../net/chatQueue';
import {
  type Action,
  HoldAction,
  actionMessage,
  contextAction,
  holdDuration,
  tankRose,
} from './actions';
import { DirectionInput, isTyping } from './input';
import { TaskSession } from './tasks/taskSession';
import {
  type Camera,
  clampCamera,
  createCamera,
  zoomFor,
} from './render/camera';
import type { MapAssets } from './render/assets';
import { PlayerAnimator } from './render/playerAnim';
import { preloadSprites } from './render/sprites';
import { WorldRenderer } from './render/world';
import type { StationMarks } from './render/effects';
import { approach, canSee, visiblePlayer, visionRadius } from './render/vision';

// GameSession es la partida en el navegador, sin React: abre el socket,
// interpola los snapshots, lee el teclado, elige la acción contextual,
// lleva los minijuegos y dibuja el mundo en el canvas. La interfaz
// (HUD, reunión, fin) la dibuja React leyendo `state` con subscribe.
// match decide todo; aquí solo se manda lo que el jugador intenta.

export type OpenMinigame = {
  stationId: string;
  type: StationType;
  onComplete: () => void;
  onClose: () => void;
};

export type GameState = {
  snapshot: Snapshot | null;
  status: SocketStatus;
  matchDown: boolean; // el gateway avisó que match no responde
  winner: Winner | null;
  impostorIds: string[];
  action: Action | null; // botón USAR del HUD
  holding: boolean;
  minigame: OpenMinigame | null;
  tankAlertUntil: number; // ms; aviso "tu tanque se está contaminando"
  pendingChat: string[]; // textos que esperan conexión
  notFound: boolean; // la partida ya no existe (volver al menú)
  unauthorized: boolean;
};

type Listener = () => void;

export type GameSessionOptions = {
  token: string;
  matchId: string;
  meId: string;
  map: GameMap;
  assets: MapAssets;
};

export class GameSession {
  private state: GameState = {
    snapshot: null,
    status: { state: 'connected' },
    matchDown: false,
    winner: null,
    impostorIds: [],
    action: null,
    holding: false,
    minigame: null,
    tankAlertUntil: 0,
    pendingChat: [],
    notFound: false,
    unauthorized: false,
  };
  private readonly listeners = new Set<Listener>();
  private readonly socket: GameSocket;
  private readonly interpolator = new Interpolator();
  private readonly animator = new PlayerAnimator();
  private readonly renderer: WorldRenderer;
  private readonly chatQueue: ChatQueue;
  private readonly tasks: TaskSession;
  private readonly input: DirectionInput;
  private camera: Camera;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private frameId = 0;
  private lastFrameAt = 0;
  private shownRadius: number | null = null;
  private hold: HoldAction | null = null;
  private contaminateReadyAt = 0;
  private readonly reportedTanks = new Set<number>();
  private detach: (() => void)[] = [];
  paused = false; // el menú de pausa no frena la partida, solo el input

  constructor(private readonly opts: GameSessionOptions) {
    preloadSprites();
    this.renderer = new WorldRenderer(opts.assets, opts.map, this.animator);
    this.camera = createCamera(opts.map, innerWidth, innerHeight);
    this.socket = openGameSocket({
      token: opts.token,
      matchId: opts.matchId,
      onUnauthorized: () => this.set({ unauthorized: true }),
    });
    this.chatQueue = new ChatQueue((msg) => this.send(msg));
    this.tasks = new TaskSession({
      stations: opts.map.stations,
      send: (msg) => this.send(msg),
      me: () => this.me(),
      snapshot: () => this.state.snapshot,
      mount: (type, o) => {
        const stationId = this.state.snapshot?.myActiveTask ?? '';
        this.set({
          minigame: {
            stationId,
            type,
            onComplete: o.onComplete,
            onClose: o.onClose,
          },
        });
        return { destroy: () => this.set({ minigame: null }) };
      },
      onOpen: () => this.send({ type: 'move', dx: 0, dy: 0 }),
      onClose: () => this.input.clear(),
      now: () => performance.now(),
    });
    this.input = new DirectionInput(({ dx, dy }) => {
      if (this.tasks.isOpen() || this.paused) return;
      this.send({ type: 'move', dx, dy });
    });
    this.socket.onStatus((s) => this.onStatus(s));
    this.socket.onMessage((msg) => {
      if (msg.type === 'snapshot') this.onSnapshot(msg);
      else if (msg.type === 'matchEnded') {
        this.set({ winner: msg.winner, impostorIds: msg.impostorIds });
      } else if (msg.type === 'error') {
        if (msg.code === 'SERVICE_UNAVAILABLE') {
          this.chatQueue.offline();
          this.set({ matchDown: true });
        } else if (msg.code === 'MATCH_NOT_FOUND') {
          this.set({ notFound: true });
        } else {
          console.warn(msg.code, msg.message);
        }
      }
    });
    this.socket.connect();
  }

  // --- store para React ---

  get meId(): string {
    return this.opts.meId;
  }

  get map(): GameMap {
    return this.opts.map;
  }

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = (): GameState => this.state;

  private set(patch: Partial<GameState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  // --- canvas y teclado ---

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    const resize = () => this.resize();
    resize();
    addEventListener('resize', resize);
    const onKey = (e: KeyboardEvent) => this.onKey(e);
    addEventListener('keydown', onKey);
    this.detach.push(
      () => removeEventListener('resize', resize),
      () => removeEventListener('keydown', onKey),
      this.input.attach(window),
      this.tasks.attach(window),
    );
    this.lastFrameAt = performance.now();
    this.frameId = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.frameId);
    for (const fn of this.detach) fn();
    this.detach = [];
    this.tasks.destroy();
    closeGameSocket();
    this.listeners.clear();
  }

  private resize(): void {
    if (!this.canvas || !this.ctx) return;
    const dpr = devicePixelRatio || 1;
    this.canvas.width = Math.round(innerWidth * dpr);
    this.canvas.height = Math.round(innerHeight * dpr);
    this.camera = clampCamera(
      {
        ...this.camera,
        viewWidth: innerWidth,
        viewHeight: innerHeight,
        zoom: zoomFor(innerWidth, innerHeight),
      },
      this.opts.map,
    );
  }

  // --- acciones que pide la interfaz ---

  send(msg: ClientMessage): void {
    this.socket.send(msg);
  }

  // triggerAction: la tecla E o el botón USAR.
  triggerAction = (): void => {
    const action = this.state.action;
    if (!action || !action.enabled || this.hold || this.paused) return;
    const { dx, dy } = this.input.current();
    if (dx !== 0 || dy !== 0) return; // match exige estar quieto
    if (action.kind === 'task') {
      this.tasks.start();
      return;
    }
    this.send(actionMessage(action));
    if (holdDuration(action.kind) > 0) {
      this.hold = new HoldAction(action, performance.now());
      this.set({ holding: true });
    }
  };

  sabotage = (kind: EmergencyKind): void => {
    this.send({ type: 'sabotage', kind });
  };

  vote = (targetPlayerId: string | null): void => {
    this.send({ type: 'vote', targetPlayerId });
  };

  chat = (text: string): void => {
    this.chatQueue.add(text, performance.now());
    this.set({ pendingChat: this.chatQueue.waiting().map((c) => c.text) });
  };

  closeMinigame = (): void => this.tasks.close();

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.input.clear();
      this.send({ type: 'move', dx: 0, dy: 0 });
    }
  }

  me(): PlayerView | undefined {
    return this.interpolator
      .playersAt(performance.now())
      .find((p) => p.id === this.opts.meId);
  }

  // --- red ---

  private onStatus(s: SocketStatus): void {
    // El servidor detiene al jugador cuyo stream se cortó: al volver,
    // se manda otra vez la dirección de las teclas que siguen apretadas.
    if (s.state === 'connected' && this.state.status.state === 'reconnecting') {
      const { dx, dy } = this.input.current();
      if (dx !== 0 || dy !== 0) this.send({ type: 'move', dx, dy });
    }
    if (s.state !== 'connected') this.chatQueue.offline();
    this.set({ status: s });
  }

  private onSnapshot(msg: Snapshot): void {
    const now = performance.now();
    this.interpolator.push(msg.tick, msg.players, now);
    const prev = this.state.snapshot;
    const patch: Partial<GameState> = { snapshot: msg };
    if (prev && tankRose(prev.tanks, msg.tanks, this.opts.meId, msg.myRole)) {
      patch.tankAlertUntil = now + GAME_RULES.TANK_ALERT_MS;
    }
    if (msg.meeting) this.reportedTanks.add(msg.meeting.tankSlot);
    if (this.state.matchDown) {
      patch.matchDown = false; // match volvió (S3-02)
      const { dx, dy } = this.input.current();
      if (dx !== 0 || dy !== 0) this.send({ type: 'move', dx, dy });
    }
    if (msg.phase !== 'PLAYING') patch.tankAlertUntil = 0;
    this.chatQueue.onSnapshot(msg, now);
    patch.pendingChat = this.chatQueue.waiting().map((c) => c.text);
    this.set(patch);
    this.tasks.onSnapshot(msg);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.code !== 'KeyE' || e.repeat || isTyping(e.target)) return;
    if (this.tasks.isOpen()) return;
    e.preventDefault();
    this.triggerAction();
  }

  // --- cuadro ---

  private frame = (): void => {
    this.frameId = requestAnimationFrame(this.frame);
    const ctx = this.ctx;
    if (!ctx) return;
    const now = performance.now();
    const dt = now - this.lastFrameAt;
    this.lastFrameAt = now;
    const snap = this.state.snapshot;
    const players = this.interpolator.playersAt(now);
    const me = players.find((p) => p.id === this.opts.meId);
    if (me) {
      this.camera = clampCamera(
        { ...this.camera, x: me.x, y: me.y },
        this.opts.map,
      );
    }
    const playing = snap?.phase === 'PLAYING';
    const radius = visionRadius(snap, me);
    this.shownRadius = approach(this.shownRadius, radius, dt);
    const shown = this.shownRadius;
    this.updateAction(me, now);
    this.tasks.frame();

    this.renderer.render(ctx, {
      camera: this.camera,
      dpr: devicePixelRatio || 1,
      now,
      tick: this.interpolator.tickAt(now),
      players,
      meId: this.opts.meId,
      tanks: snap?.tanks ?? [],
      oilDrops: snap?.oilDrops ?? [],
      emergency: playing ? (snap?.emergency ?? null) : null,
      meeting: playing ? (snap?.myMeeting ?? null) : null,
      marks: playing && snap ? stationMarks(snap) : null,
      visionRadius: shown,
      visible: (p) => visiblePlayer(me, p, shown),
      canSee: (x, y) => !me || canSee(me, x, y, shown),
      hold: this.holdView(now),
    });
  };

  private holdView(now: number) {
    if (!this.hold) return null;
    const waiting = this.hold.duration === Infinity;
    return {
      progress: waiting ? 0.25 : this.hold.progress(now),
      spin: waiting ? now / 300 : 0,
    };
  }

  // updateAction elige la acción contextual y avanza la que está en
  // curso: se cancela si el jugador se mueve, se aleja o la partida se
  // detiene.
  private updateAction(me: PlayerView | undefined, now: number): void {
    const snap = this.state.snapshot;
    const playing =
      snap !== null &&
      snap.phase === 'PLAYING' &&
      !snap.paused &&
      !this.state.matchDown &&
      !this.tasks.isOpen();
    const action =
      playing && me
        ? contextAction(
            me,
            snap.myRole,
            snap.tanks,
            this.opts.map,
            now,
            this.contaminateReadyAt,
            this.reportedTanks,
            snap.myTasks ?? [],
            snap.emergency,
            snap.myMeeting,
            snap.tick,
          )
        : null;
    if (!sameAction(action, this.state.action)) this.set({ action });

    const hold = this.hold;
    if (!hold) return;
    const { dx, dy } = this.input.current();
    if (dx !== 0 || dy !== 0 || !hold.sameTarget(action)) {
      this.hold = null;
      this.set({ holding: false });
      return;
    }
    if (hold.done(now)) {
      if (hold.action.kind === 'contaminate') {
        this.contaminateReadyAt = now + GAME_RULES.CONTAMINATE_COOLDOWN_MS;
      }
      this.hold = null;
      this.set({ holding: false });
    }
  }
}

function sameAction(a: Action | null, b: Action | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.kind === b.kind &&
    a.label === b.label &&
    a.enabled === b.enabled &&
    a.tankSlot === b.tankSlot &&
    a.stationId === b.stationId &&
    a.pointId === b.pointId
  );
}

// stationMarks: estaciones propias pendientes y hechas (S2-11).
export function stationMarks(snap: Snapshot): StationMarks | null {
  const tasks = snap.myTasks ?? [];
  if (tasks.length === 0) return null;
  const pending = new Set<string>();
  const done = new Set<string>();
  for (const t of tasks) (t.done ? done : pending).add(t.stationId);
  return { pending, done };
}
