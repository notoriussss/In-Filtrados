import type { ClientMessage, Snapshot } from '@in-filtrados/messages';
import type { Station, StationType } from '../map';
import { completionDelay, pickStation } from './tasks';
import type { MinigameView } from './minigameView';

// S2-11: une la tecla E, el servidor y el minijuego.
// 1. E (o el botón) junto a una estación propia pendiente manda
//    interact { stationId }.
// 2. El minijuego se abre cuando el snapshot trae myActiveTask igual a
//    esa estación: lo confirma match, no el navegador.
// 3. Al terminarlo se manda interact { completed: true }, esperando a
//    que pasen los 3 s que exige match.
// 4. Se cierra con Esc, al salir de PLAYING o si myActiveTask cambia
//    (el jugador se alejó y match canceló la tarea).

const TASK_KEY = 'KeyE';
const CLOSE_KEY = 'Escape';
const REQUEST_TTL_MS = 1500; // si match no confirma, se olvida el pedido

export type TaskSessionDeps = {
  stations: Station[];
  send: (msg: ClientMessage) => void;
  me: () => { x: number; y: number } | undefined;
  snapshot: () => Snapshot | null;
  mount: (
    type: StationType,
    opts: { onComplete: () => void; onClose: () => void },
  ) => MinigameView;
  showButton: (visible: boolean) => void;
  onOpen: () => void; // game.ts deja de mandar move
  onClose: () => void;
  now: () => number;
};

type Open = {
  stationId: string;
  startedAt: number;
  view: MinigameView;
  timer: ReturnType<typeof setTimeout> | null;
};

export class TaskSession {
  private requested: { stationId: string; at: number } | null = null;
  private open: Open | null = null;
  private buttonShown = false;

  constructor(private readonly deps: TaskSessionDeps) {}

  isOpen(): boolean {
    return this.open !== null;
  }

  attach(target: Window): () => void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.repeat) return;
      if (e.code === TASK_KEY) this.start();
      else if (e.code === CLOSE_KEY) this.close();
    };
    target.addEventListener('keydown', onKeyDown);
    return () => target.removeEventListener('keydown', onKeyDown);
  }

  // start pide al servidor empezar la tarea de la estación cercana.
  start(): void {
    if (this.open) return;
    const station = this.nearStation();
    if (!station) return;
    this.deps.send({ type: 'interact', stationId: station.id });
    this.requested = { stationId: station.id, at: this.deps.now() };
  }

  // frame muestra el botón "Hacer tarea" solo junto a una estación
  // propia pendiente y con el minijuego cerrado.
  frame(): void {
    const visible = !this.open && this.nearStation() !== null;
    if (visible === this.buttonShown) return;
    this.buttonShown = visible;
    this.deps.showButton(visible);
  }

  onSnapshot(snap: Snapshot): void {
    if (snap.phase !== 'PLAYING') {
      this.requested = null;
      this.close();
      return;
    }
    if (this.open) {
      if (snap.myActiveTask !== this.open.stationId) this.close();
      return;
    }
    const req = this.requested;
    if (!req) return;
    if (snap.myActiveTask === req.stationId) {
      this.requested = null;
      this.openGame(req.stationId);
    } else if (this.deps.now() - req.at > REQUEST_TTL_MS) {
      this.requested = null;
    }
  }

  close(): void {
    const open = this.open;
    if (!open) return;
    this.open = null;
    if (open.timer !== null) clearTimeout(open.timer);
    open.view.destroy();
    this.deps.onClose();
  }

  destroy(): void {
    this.close();
    this.deps.showButton(false);
  }

  private openGame(stationId: string): void {
    const station = this.deps.stations.find((s) => s.id === stationId);
    if (!station) return;
    this.deps.onOpen();
    const open: Open = {
      stationId,
      startedAt: this.deps.now(),
      view: this.deps.mount(station.type, {
        onComplete: () => this.complete(open),
        onClose: () => this.close(),
      }),
      timer: null,
    };
    this.open = open;
    this.frame();
  }

  // complete manda completed cuando ya pasaron los 3 s y cierra.
  private complete(open: Open): void {
    if (this.open !== open || open.timer !== null) return;
    const delay = completionDelay(open.startedAt, this.deps.now());
    open.timer = setTimeout(() => {
      if (this.open !== open) return;
      this.deps.send({
        type: 'interact',
        stationId: open.stationId,
        completed: true,
      });
      open.timer = null;
      this.close();
    }, delay);
  }

  private nearStation(): Station | null {
    const snap = this.deps.snapshot();
    const me = this.deps.me();
    if (!snap || !me || snap.phase !== 'PLAYING') return null;
    return pickStation(me, snap.myTasks, this.deps.stations);
  }
}

// Escribir en un campo de texto no debe abrir tareas.
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA';
}
