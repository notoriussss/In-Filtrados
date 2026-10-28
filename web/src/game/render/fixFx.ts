import type { Emergency, EmergencyKind } from '@in-filtrados/messages';
import type { FixPoint } from '../../map';
import { GAME_RULES } from '../../constants';
import {
  C,
  PX,
  clamp01,
  hash01,
  mix,
  px,
  pxDisc,
  pxEllipse,
  pxLine,
  pxRing,
  snap,
} from '../tasks/draw/pixel';
import { drawSparkles } from './workFx';

// Emergencias en el mapa (S3-05): la válvula de vapor y la tubería rota.
// Cada una tiene su escena completa: entra con un golpe de aparición,
// reacciona mientras alguien la sostiene (el volante gira y el vapor se
// apaga; la abrazadera baja y se aprieta) y termina con su cierre —
// arreglada o reventada—. Todo es dibujo: match solo manda la emergencia
// y los puntos sostenidos.

const STEAM_CLOSE_MS = 2000; // steamFixTicks en match
const APPEAR_MS = 450;
const FIXED_MS = 1600;
const BURST_MS = 1400;
const SEAL_IN_MS = 450;
const SEAL_OUT_MS = 300;
const SPIN_RATE = 8; // rad/s del volante
const SPIN_EASE = 7;
const OUTCOME_SLACK_TICKS = 3;
const HELD_RECENT_MS = 1500;
const GRAVITY = 420;
const SHADOW = 'rgba(2, 8, 20, 0.45)';
const STEAM_WHITE = '#f2f8fc';
const STEAM_BLUE = '#c9dcec';
const FLOOR_DEPTH = -1e9; // el piso va debajo de todo lo ordenado

export type FixOutcome = 'fixed' | 'burst' | 'cancelled';

// fixOutcome adivina cómo terminó la emergencia con lo último que se vio.
// El vapor solo termina cerrado; la tubería reventó si el reloj llegó a
// su límite, y se arregló si alguien la sostenía poco antes.
export function fixOutcome(
  kind: EmergencyKind,
  lastTick: number | null,
  endsAt: number,
  heldRecently: boolean,
): FixOutcome {
  if (kind === 'steam') return heldRecently ? 'fixed' : 'cancelled';
  if (lastTick !== null && lastTick >= endsAt - OUTCOME_SLACK_TICKS) {
    return 'burst';
  }
  return heldRecently ? 'fixed' : 'cancelled';
}

type PointFx = {
  heldSince: number | null;
  seal: number; // 0 a 1: cuánto cerró la válvula / bajó la abrazadera
  omega: number; // rad/s del volante
  angle: number;
};

type Session = {
  kind: EmergencyKind;
  startedAt: number;
  startTick: number | null;
  lastTick: number | null;
  endsAt: number;
  heldAt: number; // última vez (ms) que alguien sostuvo un punto
  heldCount: number;
  points: Map<string, PointFx>;
};

type Ending = {
  kind: EmergencyKind;
  outcome: Exclude<FixOutcome, 'cancelled'>;
  at: number;
  points: Map<string, PointFx>;
};

type Look = {
  fp: FixPoint;
  fx: PointFx;
  seal: number;
  appear: number; // 0 a 1 durante APPEAR_MS
  age: number; // ms desde que apareció
  held: boolean;
  urgency: number; // 1 = recién rota, 0 = a punto de reventar
  heldCount: number;
  total: number;
  end: { outcome: Ending['outcome']; age: number } | null;
};

function newPoint(): PointFx {
  return { heldSince: null, seal: 0, omega: 0, angle: 0 };
}

function pointOf(points: Map<string, PointFx>, id: string): PointFx {
  let fx = points.get(id);
  if (!fx) {
    fx = newPoint();
    points.set(id, fx);
  }
  return fx;
}

export function backOut(k: number): number {
  const c = 1.70158;
  const t = clamp01(k) - 1;
  return 1 + (c + 1) * t * t * t + c * t * t;
}

function easeOut(k: number): number {
  return 1 - (1 - clamp01(k)) ** 3;
}

// FixEffects lleva, cuadro a cuadro, lo que hace falta para animar las
// emergencias: desde cuándo se sostiene cada punto, cuánto cerró y cómo
// terminó la última. No decide nada del juego.
export class FixEffects {
  private session: Session | null = null;
  private endings: Ending[] = [];
  private last = 0;

  // update se llama una vez por cuadro con la emergencia del snapshot.
  update(e: Emergency | null, tick: number | null, now: number): void {
    const dt = Math.min(Math.max(now - this.last, 0), 100);
    this.last = now;
    if (this.session && (!e || e.kind !== this.session.kind)) {
      this.close(now);
    }
    this.endings = this.endings.filter((en) => now - en.at < lifeOf(en));
    if (!e) return;
    if (!this.session) {
      this.session = {
        kind: e.kind,
        startedAt: now,
        startTick: tick,
        lastTick: tick,
        endsAt: e.endsAtTick,
        heldAt: 0,
        heldCount: 0,
        points: new Map(),
      };
    }
    const s = this.session;
    s.endsAt = e.endsAtTick;
    s.heldCount = e.heldPoints.length;
    if (tick !== null) {
      s.lastTick = tick;
      s.startTick ??= tick;
    }
    const held = new Set(e.heldPoints);
    for (const id of held) {
      const fx = pointOf(s.points, id);
      fx.heldSince ??= now;
      s.heldAt = now;
    }
    for (const [id, fx] of s.points) {
      if (!held.has(id)) fx.heldSince = null;
      stepPoint(fx, s.kind, now, dt);
    }
  }

  // outcomes: cómo terminaron las emergencias que aún se están animando.
  get outcomes(): FixOutcome[] {
    return this.endings.map((en) => en.outcome);
  }

  private close(now: number): void {
    const s = this.session;
    this.session = null;
    if (!s) return;
    const recent = s.heldAt > 0 && now - s.heldAt < HELD_RECENT_MS;
    const outcome = fixOutcome(s.kind, s.lastTick, s.endsAt, recent);
    if (outcome === 'cancelled') return;
    this.endings.push({ kind: s.kind, outcome, at: now, points: s.points });
  }

  private looks(points: FixPoint[], now: number): Look[] {
    const out: Look[] = [];
    const s = this.session;
    if (s) {
      const mine = points.filter((fp) => fp.kind === s.kind);
      const span = (s.startTick ?? 0) > 0 ? s.endsAt - (s.startTick ?? 0) : 0;
      const left = s.lastTick === null ? span : s.endsAt - s.lastTick;
      for (const fp of mine) {
        const fx = pointOf(s.points, fp.id);
        out.push({
          fp,
          fx,
          seal: fx.seal,
          appear: clamp01((now - s.startedAt) / APPEAR_MS),
          age: now - s.startedAt,
          held: fx.heldSince !== null,
          urgency: s.kind === 'pipe' && span > 0 ? clamp01(left / span) : 1,
          heldCount: s.heldCount,
          total: mine.length,
          end: null,
        });
      }
    }
    for (const en of this.endings) {
      const mine = points.filter((fp) => fp.kind === en.kind);
      for (const fp of mine) {
        const fx = pointOf(en.points, fp.id);
        out.push({
          fp,
          fx,
          seal: en.outcome === 'fixed' ? 1 : fx.seal,
          appear: 1,
          age: lifeOf(en),
          held: en.outcome === 'fixed',
          urgency: 0,
          heldCount: en.outcome === 'fixed' ? mine.length : 0,
          total: mine.length,
          end: { outcome: en.outcome, age: now - en.at },
        });
      }
    }
    return out;
  }

  // floors: lo que va sobre el piso, debajo de todo (aros y charcos).
  // bodies: los objetos, ordenados con los props y los jugadores.
  // air: lo que flota encima de todo (vapor, agua, avisos).
  drawables(
    ctx: CanvasRenderingContext2D,
    points: FixPoint[],
    now: number,
    calm: boolean,
  ): { depth: number; draw: () => void }[] {
    const T = calm ? 0 : now;
    const items: { depth: number; draw: () => void }[] = [];
    for (const L of this.looks(points, now)) {
      items.push({
        depth: FLOOR_DEPTH,
        draw: () => drawFloor(ctx, L, T, calm),
      });
      items.push({
        depth: L.fp.y + 6,
        draw: () => drawBody(ctx, L, T, calm),
      });
    }
    return items;
  }

  drawAir(
    ctx: CanvasRenderingContext2D,
    points: FixPoint[],
    now: number,
    calm: boolean,
  ): void {
    const T = calm ? 0 : now;
    for (const L of this.looks(points, now)) drawAir(ctx, L, T, calm);
  }
}

function lifeOf(en: Ending): number {
  return en.outcome === 'fixed' ? FIXED_MS : BURST_MS;
}

function stepPoint(
  fx: PointFx,
  kind: EmergencyKind,
  now: number,
  dt: number,
): void {
  const k = dt / 1000;
  const held = fx.heldSince !== null;
  if (kind === 'steam') {
    const target =
      held && fx.heldSince !== null
        ? clamp01((now - fx.heldSince) / STEAM_CLOSE_MS)
        : 0;
    const rate = target > fx.seal ? 14 : 3;
    fx.seal += (target - fx.seal) * Math.min(1, k * rate);
  } else {
    const step = held ? (k * 1000) / SEAL_IN_MS : -(k * 1000) / SEAL_OUT_MS;
    fx.seal = clamp01(fx.seal + step);
  }
  const spin = kind === 'steam' && held ? SPIN_RATE : 0;
  fx.omega += (spin - fx.omega) * Math.min(1, k * SPIN_EASE);
  fx.angle += fx.omega * k;
}

// ---------------------------------------------------------------- piezas

// slab: bloque de metal con borde de tinta y luz arriba a la izquierda.
function slab(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  px(ctx, x, y, w, h, C.metalInk);
  px(ctx, x + PX, y + PX, w - PX * 2, h - PX * 2, C.metalDark);
  px(ctx, x + PX, y + PX, w - PX * 2, PX, C.metalHi);
  px(ctx, x + PX, y + PX, PX, h - PX * 2, C.metalMid);
}

// tube: tramo horizontal de tubería con cuatro tonos de volumen.
function tube(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y: number,
  h: number,
): void {
  const w = x1 - x0;
  px(ctx, x0 - PX, y - PX, w + PX * 2, h + PX * 2, C.metalInk);
  px(ctx, x0, y, w, 2, C.metalHi);
  px(ctx, x0, y + 2, w, 4, C.metal);
  px(ctx, x0, y + 6, w, h - 10, C.metalMid);
  px(ctx, x0, y + h - 4, w, 4, C.metalDark);
}

function flange(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  h: number,
): void {
  slab(ctx, cx - 4, y - 5, 8, h + 10);
  px(ctx, cx - 2, y - 3, PX, PX, C.metalInk);
  px(ctx, cx - 2, y + h + 1, PX, PX, C.metalInk);
}

// ring dibuja un arco de elipse con cuadritos del tamaño del pixel-art.
function ring(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  thick: number,
  a0 = 0,
  a1 = Math.PI * 2,
): void {
  const size = thick * PX;
  const step = PX / Math.max(rx, 1);
  ctx.fillStyle = color;
  for (let a = a0; a <= a1; a += step) {
    ctx.fillRect(
      snap(cx + Math.cos(a) * rx - size / 2),
      snap(cy + Math.sin(a) * ry - size / 2),
      size,
      size,
    );
  }
}

function badge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
): void {
  if (s <= 0.02) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  px(ctx, -10, -10, 20, 20, C.ink);
  px(ctx, -8, -8, 16, 16, C.leaf);
  px(ctx, -8, -8, 16, 2, C.leafHi);
  px(ctx, -8, 6, 16, 2, C.leafLo);
  pxLine(ctx, -5, 0, -2, 4, C.ink, 1);
  pxLine(ctx, -2, 4, 5, -4, C.ink, 1);
  ctx.restore();
}

function blob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  alpha: number,
  color: string,
): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- piso

function rangeColor(L: Look): string {
  if (L.end) return L.end.outcome === 'fixed' ? C.leaf : C.coral;
  return L.held ? C.amber : C.coral;
}

function drawFloor(
  ctx: CanvasRenderingContext2D,
  L: Look,
  T: number,
  calm: boolean,
): void {
  const { x, y } = L.fp;
  const color = rangeColor(L);
  const fade = L.end ? 1 - clamp01((L.end.age - 900) / 500) : 1;
  ctx.save();
  ctx.globalAlpha = fade * clamp01(L.appear * 2);
  if (L.fp.kind === 'pipe') drawPuddle(ctx, L, T);

  // Aro de alcance: rayas que marchan alrededor de donde hay que pararse.
  const rx = GAME_RULES.FIX_RANGE;
  const ry = rx * 0.4;
  const march = Math.floor(T / 90);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha *= 0.55;
  const dashes = 28;
  for (let i = 0; i < dashes; i++) {
    if ((i + march) % 2 !== 0) continue;
    const a = (i / dashes) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(x, y + 12, rx, ry, 0, a, a + (Math.PI * 2) / dashes);
    ctx.stroke();
  }
  ctx.restore();

  if (calm) return;
  // Ondas que salen del punto, para llamar la atención.
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  for (let i = 0; i < 2; i++) {
    const t = (T / 1400 + i / 2) % 1;
    ctx.globalAlpha = (1 - t) * 0.6 * fade;
    ctx.beginPath();
    ctx.ellipse(x, y + 12, 18 + t * 30, 7 + t * 12, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Golpe de aparición: un anillo grande que se abre una sola vez.
  if (!L.end && L.appear < 1) {
    const e = easeOut(L.appear);
    ctx.globalAlpha = 1 - L.appear;
    ctx.strokeStyle = C.coral;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(x, y + 12, 12 + e * 84, 5 + e * 34, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Cierre: onda verde al arreglar, onda roja al reventar.
  if (L.end) {
    const k = clamp01(L.end.age / (L.end.outcome === 'fixed' ? 800 : 700));
    const e = easeOut(k);
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = L.end.outcome === 'fixed' ? C.leaf : C.coral;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(x, y + 12, 16 + e * 96, 6 + e * 38, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// Charco bajo la tubería: crece mientras gotea y tiene ondas.
function drawPuddle(ctx: CanvasRenderingContext2D, L: Look, T: number): void {
  const { x, y } = L.fp;
  const leak = pipeLeak(L);
  const grown = clamp01(L.age / 6000);
  const base = L.end?.outcome === 'burst' ? 1 : grown;
  const rx = Math.round(12 + 30 * base * (0.35 + 0.65 * leak));
  const ry = Math.round(rx * 0.32);
  const cx = x + 8;
  const cy = y + 22;
  pxEllipse(ctx, cx, cy, rx + 4, ry + 2, C.waterDeep);
  pxEllipse(ctx, cx, cy, rx, ry, C.waterLo);
  pxEllipse(ctx, cx - 4, cy - 2, Math.round(rx * 0.55), 2, C.water);
  const glint = Math.floor(T / 260) % 3;
  px(ctx, cx - rx * 0.5 + glint * 8, cy - ry * 0.6, 6, PX, C.waterHi);
  if (leak > 0.05) {
    for (let i = 0; i < 2; i++) {
      const t = (T / 900 + i / 2) % 1;
      ctx.globalAlpha *= 1;
      ctx.save();
      ctx.globalAlpha *= (1 - t) * leak;
      ctx.strokeStyle = C.waterHi;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cx + 6, cy, 4 + t * rx * 0.8, 2 + t * ry * 0.8, 0, 0, 6.3);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------- cuerpo

function fadeOf(L: Look): number {
  let a = clamp01(L.appear * 2);
  if (L.end) a *= 1 - clamp01((L.end.age - (lifeMs(L) - 450)) / 450);
  return a;
}

function lifeMs(L: Look): number {
  return L.end?.outcome === 'burst' ? BURST_MS : FIXED_MS;
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  L: Look,
  T: number,
  calm: boolean,
): void {
  const drop = calm || L.end ? 0 : (1 - backOut(L.appear)) * -40;
  const leak = L.fp.kind === 'steam' ? steamLeak(L) : pipeLeak(L);
  const rattle = calm || L.end ? 0 : Math.sin(T / 31) * leak * 0.9;
  ctx.save();
  ctx.globalAlpha = fadeOf(L);
  ctx.translate(snap(rattle), snap(drop));
  if (L.fp.kind === 'steam') steamBody(ctx, L, T);
  else pipeBody(ctx, L, T);
  ctx.restore();
}

// Cuánto vapor sale (0 a 1): se apaga a medida que cierra el volante y,
// al cerrar, suelta un último resoplido.
function steamLeak(L: Look): number {
  if (L.end) {
    const a = L.end.age;
    const puff = Math.max(0, 1 - Math.abs(a - 120) / 160) * 0.7;
    return Math.max(0, 1 - a / 500) * 0.3 + puff;
  }
  let p = (1 - L.seal) ** 1.3;
  if (L.seal > 0.7) p *= 0.6 + 0.4 * Math.sin(L.age / 55) ** 2;
  return p;
}

function pipeLeak(L: Look): number {
  if (L.end?.outcome === 'burst') return 1;
  if (L.end) return Math.max(0, 1 - L.end.age / 250) * 0.4;
  return 1 - 0.85 * easeOut(L.seal);
}

function lampColor(L: Look, T: number): string {
  if (L.end?.outcome === 'fixed') return C.leaf;
  if (L.held) return C.amber;
  return Math.floor(T / 350) % 2 === 0 ? C.coral : C.coralLo;
}

function steamBody(ctx: CanvasRenderingContext2D, L: Look, T: number): void {
  const { x, y } = L.fp;
  pxEllipse(ctx, x, y + 17, 40, 7, SHADOW);
  // Tubo con una brida rota a la derecha, de donde sale el vapor.
  tube(ctx, x - 38, x + 36, y, 14);
  flange(ctx, x - 30, y, 14);
  flange(ctx, x + 30, y, 14);
  slab(ctx, x + 36, y - 5, 8, 24);
  px(ctx, x + 40, y + 5, 4, 6, C.ink);
  px(ctx, x + 38, y + 14, PX, PX, C.metalInk);
  // Cuerpo de la válvula y su yugo.
  slab(ctx, x - 10, y - 14, 20, 14);
  slab(ctx, x - 12, y - 32, 4, 20);
  slab(ctx, x + 8, y - 32, 4, 20);
  slab(ctx, x - 14, y - 34, 28, 4);
  // Vástago con rosca que sube y baja al girar.
  px(ctx, x - 1, y - 30, 2, 18, C.metal);
  const shift = Math.floor(L.fx.angle * 2.5) % 3;
  for (let i = 0; i < 5; i++) {
    px(ctx, x - 2, y - 29 + i * 4 + shift * PX, 4, PX, C.metalDark);
  }
  drawGauge(ctx, x + 22, y - 22, 1 - L.seal, T, L.end === null);
  // Faro: parpadea en rojo, ámbar al sostener y verde al cerrar.
  px(ctx, x - 25, y - 16, 2, 16, C.metalDark);
  slab(ctx, x - 28, y - 26, 8, 10);
  px(ctx, x - 26, y - 24, 4, 6, lampColor(L, T));
  drawWheel(ctx, L, x, y - 42, T);
}

function drawGauge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  pressure: number,
  T: number,
  alive: boolean,
): void {
  px(ctx, cx - 1, cy + 6, 2, 8, C.metalDark);
  pxDisc(ctx, cx, cy, 8, C.metalInk);
  pxDisc(ctx, cx, cy, 6, C.white);
  const zones = [
    { from: Math.PI, to: Math.PI * 1.34, color: C.leaf },
    { from: Math.PI * 1.34, to: Math.PI * 1.67, color: C.amber },
    { from: Math.PI * 1.67, to: Math.PI * 2, color: C.coral },
  ];
  for (const z of zones) pxRing(ctx, cx, cy, 4, z.color, 1, z.from, z.to);
  const tremble = alive ? Math.sin(T / 45) * 0.05 * pressure : 0;
  const a = Math.PI + clamp01(pressure + tremble) * Math.PI;
  pxLine(ctx, cx, cy, cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, C.ink, 1);
  pxDisc(ctx, cx, cy, 2, C.ink);
}

// Volante visto desde arriba y de frente: un aro achatado con cuatro
// radios y agarraderas ámbar que se ven pasar por delante y por detrás.
function drawWheel(
  ctx: CanvasRenderingContext2D,
  L: Look,
  cx: number,
  cy: number,
  T: number,
): void {
  const rx = 18;
  const ry = 7;
  const jitter = L.held || L.end ? 0 : Math.sin(T / 40) * 0.05;
  const base = L.fx.angle + jitter;
  const blur = L.fx.omega > 3;
  const spokes = (angle: number, color: string, thick: number) => {
    for (let i = 0; i < 4; i++) {
      const a = angle + (i * Math.PI) / 2;
      pxLine(
        ctx,
        cx,
        cy,
        cx + Math.cos(a) * (rx - 2),
        cy + Math.sin(a) * (ry - 1),
        color,
        thick,
      );
    }
  };
  ring(ctx, cx, cy, rx, ry, C.ink, 3);
  ring(ctx, cx, cy, rx, ry, C.coralLo, 2);
  ring(ctx, cx, cy, rx, ry, C.coral, 2, 0, Math.PI);
  ring(
    ctx,
    cx,
    cy,
    rx - 2,
    ry - 1,
    C.coralHi,
    1,
    Math.PI * 0.12,
    Math.PI * 0.5,
  );
  if (blur) {
    ctx.globalAlpha *= 0.25;
    spokes(base - 0.5, C.amber, 1);
    ctx.globalAlpha *= 1 / 0.25;
  }
  spokes(base, C.ink, 2);
  spokes(base, C.metal, 1);
  for (let i = 0; i < 4; i++) {
    const a = base + (i * Math.PI) / 2;
    const kx = cx + Math.cos(a) * (rx - 1);
    const ky = cy + Math.sin(a) * (ry - 0.5);
    const near = Math.sin(a) > 0;
    pxDisc(ctx, kx, ky, near ? 4 : 3, C.ink);
    pxDisc(ctx, kx, ky, near ? 2 : 2, near ? C.amber : C.amberLo);
    if (near) px(ctx, kx - 2, ky - 2, PX, PX, C.amberHi);
  }
  pxDisc(ctx, cx, cy, 4, C.ink);
  pxDisc(ctx, cx, cy, 2, L.held ? C.leafHi : C.metalHi);
}

function pipeBody(ctx: CanvasRenderingContext2D, L: Look, T: number): void {
  const { x, y } = L.fp;
  const burst = L.end?.outcome === 'burst' ? L.end.age : -1;
  const split = burst >= 0 ? easeOut(burst / 500) : 0;
  pxEllipse(ctx, x, y + 21, 48, 7, SHADOW);
  for (const sx of [x - 36, x + 36]) slab(ctx, sx - 5, y + 9, 10, 13);
  // Mitad izquierda y mitad derecha; la derecha cuelga un poco mientras
  // la tubería está rota.
  ctx.save();
  ctx.translate(snap(-split * 12), snap(split * 3));
  tube(ctx, x - 46, x - 2, y - 9, 18);
  flange(ctx, x - 44, y - 9, 18);
  flange(ctx, x - 22, y - 9, 18);
  ctx.restore();
  ctx.save();
  const sag = burst < 0 ? (1 - easeOut(L.seal)) * 2 : 0;
  ctx.translate(snap(split * 12), snap(sag + split * 5));
  tube(ctx, x + 2, x + 46, y - 9, 18);
  flange(ctx, x + 44, y - 9, 18);
  flange(ctx, x + 22, y - 9, 18);
  ctx.restore();
  // La grieta: hueco oscuro con dientes de metal rasgado.
  if (burst < 0 && L.seal < 0.5) {
    px(ctx, x - 2, y - 9, 4, 18, C.ink);
    for (let r = 0; r < 5; r++) {
      px(ctx, x - 4 + (r % 2) * 6, y - 9 + r * 4, 2, 4, C.metalMid);
    }
    px(ctx, x - 1, y - 6, PX, 8, C.waterDeep);
  }
  if (burst < 0) drawClamp(ctx, L, T);
}

// Abrazadera que baja desde arriba, se asienta con un rebote y aprieta
// sus cuatro tornillos uno a uno.
function drawClamp(ctx: CanvasRenderingContext2D, L: Look, T: number): void {
  const { x, y } = L.fp;
  if (L.seal <= 0.01) return;
  const k = backOut(L.seal);
  const off = snap(-(1 - k) * 46);
  const settled = L.seal >= 1;
  slab(ctx, x - 12, y - 14 + off, 24, 28);
  px(ctx, x - 10, y - 9 + off, 20, PX, C.metalDeep);
  px(ctx, x - 10, y + 7 + off, 20, PX, C.metalDeep);
  px(ctx, x - 8, y - 4 + off, 16, 8, C.metalDark);
  px(ctx, x - 8, y - 4 + off, 16, PX, C.metalMid);
  const turning = !settled || (L.end === null && L.held && L.age % 400 < 120);
  const flash =
    L.end?.outcome === 'fixed'
      ? clamp01(1 - L.end.age / 600) * (0.5 + 0.5 * Math.sin(L.end.age / 40))
      : 0;
  const bolts = [
    [-9, -12],
    [5, -12],
    [-9, 8],
    [5, 8],
  ];
  bolts.forEach(([bx, by], i) => {
    const color = mix(C.metalHi, C.leafHi, flash);
    px(ctx, x + bx, y + by + off, 4, 4, color);
    const slot = (Math.floor(T / 70) + i) % 2 === 0;
    const bright = turning && !settled;
    if (slot) px(ctx, x + bx, y + by + off + 1, 4, PX / 2, C.metalInk);
    else px(ctx, x + bx + 1, y + by + off, PX / 2, 4, C.metalInk);
    if (bright) px(ctx, x + bx, y + by + off, PX, PX, C.white);
  });
}

// ---------------------------------------------------------------- aire

function drawAir(
  ctx: CanvasRenderingContext2D,
  L: Look,
  T: number,
  calm: boolean,
): void {
  ctx.save();
  ctx.globalAlpha = fadeOf(L);
  if (L.fp.kind === 'steam') steamAir(ctx, L, T, calm);
  else pipeAir(ctx, L, T, calm);
  ctx.restore();
  if (L.end?.outcome === 'fixed') endingFixed(ctx, L, calm);
}

// Una columna de bolas de vapor que sube, se ensancha y se desvanece.
function plume(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
  power: number,
  T: number,
  seed: number,
): void {
  if (power < 0.03) return;
  const n = Math.ceil(12 * power) + 3;
  for (let i = 0; i < n; i++) {
    const h = hash01(seed * 31 + i);
    const life = 800 + 500 * h;
    const k = (T / life + i / n + h) % 1;
    const dist = (12 + 50 * power * (0.6 + 0.4 * h)) * k;
    const x = sx + dx * dist + Math.sin(k * 5 + i) * 3 * k;
    const y = sy + dy * dist - k * k * 20;
    const r = (2.5 + 10 * k) * (0.5 + 0.5 * power);
    const alpha = (1 - k) * 0.6 * Math.min(1, power * 1.4);
    blob(ctx, x, y, r + 1.5, alpha * 0.5, STEAM_BLUE);
    blob(ctx, x, y, r, alpha, k < 0.4 ? STEAM_WHITE : STEAM_BLUE);
  }
}

function steamAir(
  ctx: CanvasRenderingContext2D,
  L: Look,
  T: number,
  calm: boolean,
): void {
  const { x, y } = L.fp;
  const power = steamLeak(L);
  plume(ctx, x + 44, y + 7, 1, -0.35, power, T, 1);
  plume(ctx, x + 14, y - 16, 0.2, -1, power * 0.8, T, 2);
  if (power > 0.1 && !calm) {
    // Silbidos: rayitas que salen disparadas de la brida.
    ctx.fillStyle = STEAM_WHITE;
    for (let i = 0; i < 4; i++) {
      if ((Math.floor(T / 60) + i) % 3 === 0) continue;
      const a = -0.35 + (hash01(i + Math.floor(T / 120)) - 0.5) * 0.7;
      const len = (8 + 10 * hash01(i + 5)) * power;
      ctx.globalAlpha = 0.8 * power;
      pxLine(
        ctx,
        x + 46,
        y + 7,
        x + 46 + Math.cos(a) * len,
        y + 7 + Math.sin(a) * len,
        STEAM_WHITE,
        1,
      );
    }
    ctx.globalAlpha = 1;
  }
  // Chispas ámbar que saltan de las agarraderas al girar.
  if (L.fx.omega > 3 && !calm) {
    for (let i = 0; i < 3; i++) {
      const t = (T / 380 + i / 3) % 1;
      const a = L.fx.angle * 2 + i * 2.1;
      ctx.globalAlpha = 1 - t;
      px(
        ctx,
        x + Math.cos(a) * (18 + t * 10),
        y - 42 + Math.sin(a) * (7 + t * 4) - t * 8,
        PX,
        PX,
        C.amberHi,
      );
    }
    ctx.globalAlpha = 1;
  }
  glow(ctx, x - 24, y - 21, lampColor(L, T), L.held ? 0.5 : 0.8, T, calm);
}

// Resplandor del faro.
function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  strength: number,
  T: number,
  calm: boolean,
): void {
  const pulse = calm ? 1 : 0.7 + 0.3 * Math.sin(T / 160);
  const g = ctx.createRadialGradient(x, y, 1, x, y, 26);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.45 * strength * pulse;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function spray(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  spread: number,
  speed: number,
  n: number,
  power: number,
  T: number,
  floorY: number,
  seed: number,
): void {
  if (power < 0.03) return;
  for (let i = 0; i < n; i++) {
    const h = hash01(seed * 17 + i);
    const life = 0.55 + 0.3 * h;
    const t = (((T / 1000 + i * 0.11) / life) % 1) * life;
    const side = i % 2 === 0 ? 1 : -1;
    const x = sx + side * spread * (0.3 + 0.7 * h) * power * t * 2;
    const vy = -speed * (0.6 + 0.4 * hash01(seed * 5 + i + 9)) * power;
    const y = sy + vy * t + 0.5 * GRAVITY * t * t;
    if (y > floorY) continue;
    const bright = i % 4 === 0;
    const big = i % 3 === 0 ? PX * 2 : PX;
    px(ctx, x, y, big, big, bright ? C.waterHi : C.water);
  }
}

function pipeAir(
  ctx: CanvasRenderingContext2D,
  L: Look,
  T: number,
  calm: boolean,
): void {
  const { x, y } = L.fp;
  const burst = L.end?.outcome === 'burst' ? L.end.age : -1;
  const floorY = y + 20;
  const power = pipeLeak(L);
  if (burst >= 0) burstAir(ctx, L, burst, T);
  else {
    const hole = L.seal < 0.5 || L.end !== null;
    const sx = x + 1;
    if (hole && power > 0.05) {
      // Columna de agua con borde claro, más las gotas que caen en arco.
      const h = Math.round(18 * power);
      pxLine(ctx, sx, y - 10, sx, y - 10 - h, C.water, 3);
      pxLine(ctx, sx - 1, y - 10, sx - 1, y - 10 - h, C.waterHi, 1);
      spray(ctx, sx, y - 10 - h, 38, 170, 30, power, T, floorY, 3);
      mist(ctx, sx, y - 12, power, T, calm);
    }
    // Con la abrazadera puesta solo gotea por los bordes, hasta que el otro
    // extremo también se sostiene.
    if (L.seal > 0.5 && !L.end) {
      const flick = calm ? 1 : 0.5 + 0.5 * Math.sin(T / 70);
      spray(ctx, x - 13, y + 2, 26, 50, 4, 0.5 * flick, T, floorY, 7);
      spray(ctx, x + 13, y + 2, 26, 50, 4, 0.5 * flick, T, floorY, 8);
    }
  }
  if (!L.end) drawUrgency(ctx, L, x, y - 38, T, calm);
  const lamp = L.end?.outcome === 'fixed' ? C.leaf : L.held ? C.amber : C.coral;
  glow(ctx, x, y - 12, lamp, L.end ? 0.3 : 0.5, T, calm);
}

function mist(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  power: number,
  T: number,
  calm: boolean,
): void {
  if (calm) return;
  for (let i = 0; i < 5; i++) {
    const k = (T / 1200 + i / 5) % 1;
    const px_ = x + Math.sin(k * 6 + i * 2) * 10;
    blob(
      ctx,
      px_,
      y - 6 - k * 26,
      4 + k * 8,
      (1 - k) * 0.28 * power,
      STEAM_WHITE,
    );
  }
}

// Reloj de la tubería: un aro que se vacía y dos pastillas que dicen
// cuántos extremos ya se sostienen.
function drawUrgency(
  ctx: CanvasRenderingContext2D,
  L: Look,
  cx: number,
  cy: number,
  T: number,
  calm: boolean,
): void {
  if (L.appear < 1 && !calm) return;
  const late = L.urgency < 0.25;
  const blinkOff = late && !calm && Math.floor(T / 160) % 2 === 1;
  const color = L.urgency > 0.5 ? C.leaf : L.urgency > 0.25 ? C.amber : C.coral;
  pxDisc(ctx, cx, cy, 12, C.ink);
  pxDisc(ctx, cx, cy, 10, C.wall);
  const start = -Math.PI / 2;
  if (!blinkOff) {
    pxRing(ctx, cx, cy, 8, color, 2, start, start + L.urgency * Math.PI * 2);
  }
  pxDisc(ctx, cx, cy, 2, color);
  for (let i = 0; i < L.total; i++) {
    const side = (i - (L.total - 1) / 2) * 12;
    const on = i < L.heldCount;
    const waiting = !on && !calm && Math.floor(T / 350) % 2 === 0;
    px(ctx, cx + side * 2 - 3, cy - 20, 8, 8, C.ink);
    px(ctx, cx + side * 2 - 2, cy - 19, 6, 6, on ? C.leaf : C.wall);
    if (waiting) px(ctx, cx + side * 2 - 2, cy - 19, 6, 6, C.amberLo);
  }
}

// Reventón: una columna de agua, el golpe y trozos de tubo por el aire.
function burstAir(
  ctx: CanvasRenderingContext2D,
  L: Look,
  a: number,
  T: number,
): void {
  const { x, y } = L.fp;
  const floorY = y + 22;
  if (a < 1000) {
    const k = 1 - a / 1000;
    const h = Math.round(80 * easeOut(Math.min(1, a / 220)) * k);
    pxLine(ctx, x, y - 8, x, y - 8 - h, C.water, 4);
    pxLine(ctx, x - 1, y - 8, x - 1, y - 8 - h, C.waterHi, 1);
    spray(ctx, x, y - 8 - h, 60, 230, 30, 1.2 * k + 0.2, T, floorY, 11);
  }
  // Pedazos de tubo que salen volando.
  for (let i = 0; i < 7; i++) {
    const h1 = hash01(i + 40);
    const h2 = hash01(i + 70);
    const t = a / 1000;
    const vx = (h1 - 0.5) * 220;
    const vy = -(110 + 130 * h2);
    const dx = x + vx * t;
    const dy = y - 4 + vy * t + 0.5 * GRAVITY * t * t;
    if (dy > floorY || t > 1) continue;
    ctx.globalAlpha *= 1;
    px(ctx, dx, dy, 6, PX * 2, i % 2 ? C.metalMid : C.metalHi);
    px(ctx, dx, dy + 4, 6, PX, C.metalInk);
  }
}

// Cierre bueno: destellos y la palomita que aparece con rebote.
function endingFixed(
  ctx: CanvasRenderingContext2D,
  L: Look,
  calm: boolean,
): void {
  if (!L.end) return;
  const a = L.end.age;
  const { x, y } = L.fp;
  const topY = L.fp.kind === 'steam' ? y - 70 : y - 36;
  const s = a < 1000 ? backOut(a / 320) : 1 - clamp01((a - 1000) / 300);
  badge(ctx, x, topY - 8 * easeOut(a / 500), s);
  if (!calm && a < 900) drawSparkles(ctx, x, topY + 10, a / 900);
}
