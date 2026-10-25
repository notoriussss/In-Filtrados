import { workPose, flourishPose, IDLE_POSE } from '../../render/workPose';
import { BOARD, FLOOR_Y, VALVE_RADIUS, type ValveGame } from '../minigames';
import { type Scene, type SceneEnv, celebrateK } from './scene';
import { drawHand, drawTapRing } from './hand';
import {
  C,
  PX,
  bakeBoard,
  clamp01,
  hash01,
  px,
  pxDisc,
  pxLine,
  pxRing,
} from './pixel';
import { roomLayer } from './room';

// Reducir: una tubería con una fuga a la derecha y una válvula de volante
// a la izquierda. Mientras el jugador mantiene la válvula, el personaje
// la gira con todo el cuerpo, el manómetro baja de la zona roja a la
// verde y el chorro se va apagando.

const PIPE = { y: 172, h: 24, end: 256 };
const GAUGE = { x: 58, y: 66, r: 24 };
export const VALVE_HERO_X = 108;
const LEAK = { x: PIPE.end + 14, y: PIPE.y + 12 };
const JETS = [
  { vx: 38, vy: -110 },
  { vx: 64, vy: -85 },
  { vx: 92, vy: -55 },
];
const GRAVITY = 420;
const SPRAY_DROPS = 18;
const FLOW_EASE = 5; // qué tan rápido se acomoda el chorro, por segundo

// Piezas que no se mueven: tubería, soportes, cuerpo de la válvula y la
// carátula del manómetro.
function drawFixtures(c: CanvasRenderingContext2D, valve: ValveGame): void {
  const { y, h, end } = PIPE;
  // Soportes de pared bajo la tubería.
  for (const x of [40, 120, 232]) {
    px(c, x, y + h, 14, 12, C.metalDeep);
    px(c, x, y + h, 14, PX, C.metalMid);
    px(c, x + 5, y + h + 4, PX, PX, C.metalInk);
  }
  // Tubo: cuatro tonos para dar volumen.
  px(c, 0, y - PX, end, h + PX * 2, C.metalInk);
  px(c, 0, y, end, 4, C.metalHi);
  px(c, 0, y + 4, end, 6, C.metal);
  px(c, 0, y + 10, end, 8, C.metalMid);
  px(c, 0, y + 18, end, h - 18, C.metalDark);
  // Juntas atornilladas.
  for (const x of [20, 92, 226]) {
    px(c, x, y - 6, 12, h + 12, C.metalInk);
    px(c, x + 2, y - 4, 8, h + 8, C.metalMid);
    px(c, x + 2, y - 4, 3, h + 8, C.metalHi);
    px(c, x + 6, y - 2, PX, PX, C.metalInk);
    px(c, x + 6, y + h, PX, PX, C.metalInk);
  }
  // Brida rota donde sale la fuga.
  px(c, end, y - 12, 14, h + 24, C.metalInk);
  px(c, end + 2, y - 10, 10, h + 20, C.metalMid);
  px(c, end + 2, y - 10, 4, h + 20, C.metalHi);
  px(c, end + 6, y - 4, 8, 4, C.ink);
  px(c, end + 6, y + h, 8, 4, C.ink);
  // Cuerpo de la válvula detrás del volante.
  const v = valve.center;
  px(c, v.x - 18, v.y - 34, 36, 68, C.metalInk);
  px(c, v.x - 16, v.y - 32, 32, 64, C.metalDark);
  px(c, v.x - 16, v.y - 32, 6, 64, C.metalMid);
  px(c, v.x - 16, v.y - 32, 32, 4, C.metalMid);
  drawConduit(c);
  drawGaugeFace(c);
}

// Ducto de cables en el techo y caja de empalme: llenan la pared alta.
function drawConduit(c: CanvasRenderingContext2D): void {
  px(c, 0, 26, BOARD.w, 10, C.metalInk);
  px(c, 0, 28, BOARD.w, 6, C.metalDark);
  px(c, 0, 28, BOARD.w, PX, C.metalMid);
  for (const x of [30, 120, 210, 300]) {
    px(c, x, 24, 8, 14, C.metalInk);
    px(c, x + 2, 26, 4, 10, C.metalMid);
  }
  px(c, 286, 48, 40, 30, C.metalInk);
  px(c, 288, 50, 36, 26, C.metalDeep);
  px(c, 288, 50, 36, PX, C.metalMid);
  px(c, 312, 40, 6, 10, C.metalInk);
  for (const [x, y] of [
    [291, 53],
    [317, 53],
    [291, 69],
    [317, 69],
  ]) {
    px(c, x, y, PX, PX, C.metalHi);
  }
}

function drawGaugeFace(c: CanvasRenderingContext2D): void {
  const { x, y, r } = GAUGE;
  px(c, x - 32, y - 32, 64, 76, C.metalInk);
  px(c, x - 30, y - 30, 60, 72, C.metalDeep);
  px(c, x - 30, y - 30, 60, 4, C.metalMid);
  for (const [rx, ry] of [
    [-26, -26],
    [22, -26],
    [-26, 36],
    [22, 36],
  ]) {
    px(c, x + rx, y + ry, PX, PX, C.metalHi);
  }
  pxDisc(c, x, y, r + 4, C.metalInk);
  pxDisc(c, x, y, r + 2, C.metal);
  pxDisc(c, x, y, r, C.ink);
  // Zonas: verde, ámbar y roja, de izquierda a derecha.
  const zones = [
    { from: Math.PI, to: Math.PI * 1.34, color: C.leaf },
    { from: Math.PI * 1.34, to: Math.PI * 1.67, color: C.amber },
    { from: Math.PI * 1.67, to: Math.PI * 2, color: C.coral },
  ];
  for (const z of zones) pxRing(c, x, y, r - 5, z.color, 1, z.from, z.to);
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    pxLine(
      c,
      x + Math.cos(a) * (r - 9),
      y + Math.sin(a) * (r - 9),
      x + Math.cos(a) * (r - 12),
      y + Math.sin(a) * (r - 12),
      C.greyLo,
    );
  }
  px(c, x - 2, y + 8, 4, 2, C.greyLo);
}

type Spring = { pos: number; vel: number };

// La aguja se acomoda con un resorte, así que tiembla y se asienta en vez
// de deslizarse.
function springTo(s: Spring, target: number, dtMs: number): void {
  const dt = dtMs / 1000;
  s.vel += (target - s.pos) * 90 * dt;
  s.vel *= Math.exp(-9 * dt);
  s.pos += s.vel * dt;
}

export class ValveScene implements Scene {
  private readonly layer: HTMLCanvasElement;
  private flow = 1;
  private puddle = 1;
  private readonly needle: Spring = { pos: 1, vel: 0 };
  private doneAt: number | null = null;
  private tapAt = -1;
  private touched = false;
  readonly settleMs = 1100;

  constructor(
    private readonly game: ValveGame,
    private readonly env: SceneEnv,
  ) {
    env.hero.lookAt('right');
    this.layer = bakeBoard((c) => {
      c.drawImage(roomLayer(), 0, 0, BOARD.w, BOARD.h);
      drawFixtures(c, game);
    });
  }

  frame(ctx: CanvasRenderingContext2D, now: number, dt: number): void {
    const g = this.game;
    this.consume(now);
    const calm = this.env.calm;
    const target = clamp01(1 - g.fill);
    this.flow +=
      (target - this.flow) * (1 - Math.exp((-dt / 1000) * FLOW_EASE));
    this.puddle += (this.flow - this.puddle) * (1 - Math.exp(-dt / 1400));
    springTo(this.needle, this.flow, dt);
    if (g.done && this.doneAt === null) this.doneAt = now;

    ctx.drawImage(this.layer, 0, 0, BOARD.w, BOARD.h);
    this.drawGaugeNeedle(ctx, now);
    this.drawPuddle(ctx, now);
    this.driveHero(dt, now);
    this.env.hero.draw(ctx, now, {
      calm,
      celebrate: celebrateK(this.doneAt, now),
    });
    this.drawSpray(ctx, now);
    this.drawWheel(ctx, now);
    this.drawProgress(ctx);
    this.drawHint(ctx, now);
    if (this.tapAt >= 0 && !calm) {
      const k = (now - this.tapAt) / 450;
      if (k < 1) drawTapRing(ctx, g.center.x, g.center.y, k, C.leaf);
    }
  }

  get doneSince(): number | null {
    return this.doneAt;
  }

  private consume(now: number): void {
    for (const e of this.game.drainEvents()) {
      if (e.type === 'grab') {
        this.tapAt = now;
        this.touched = true;
      }
    }
  }

  private driveHero(dt: number, now: number): void {
    const g = this.game;
    const hero = this.env.hero;
    if (g.done) {
      const k = celebrateK(this.doneAt, now) ?? 0;
      hero.drive(flourishPose(k), dt);
      return;
    }
    if (g.holding) {
      // Un empujón por cada cuarto de vuelta del volante.
      hero.drive(workPose('reduce', g.angle * 360, 1), dt);
      return;
    }
    const breathe = Math.sin(now / 480);
    hero.drive(
      { ...IDLE_POSE, lean: 1.1, sy: 1 + 0.012 * breathe, dy: 0.2 * breathe },
      dt,
    );
  }

  private drawGaugeNeedle(ctx: CanvasRenderingContext2D, now: number): void {
    const { x, y, r } = GAUGE;
    const tremble = this.env.calm ? 0 : Math.sin(now / 55) * 0.012 * this.flow;
    const v = clamp01(this.needle.pos + tremble);
    const a = Math.PI + v * Math.PI;
    const tip = r - 4;
    pxLine(ctx, x, y, x + Math.cos(a) * tip, y + Math.sin(a) * tip, C.ink, 2);
    pxLine(ctx, x, y, x + Math.cos(a) * tip, y + Math.sin(a) * tip, C.white, 1);
    pxDisc(ctx, x, y, 4, C.ink);
    pxDisc(ctx, x, y, 2, C.metalHi);
    // Piloto: rojo parpadeante con fuga, verde al cerrarla.
    const calm = this.env.calm;
    const blink = calm || Math.floor(now / 350) % 2 === 0;
    let lamp: string = C.leaf;
    if (this.flow >= 0.04) lamp = blink ? C.coral : C.coralLo;
    px(ctx, x - 4, y + 32, 8, 6, C.ink);
    px(ctx, x - 2, y + 33, 4, 4, lamp);
  }

  private drawPuddle(ctx: CanvasRenderingContext2D, now: number): void {
    const half = Math.round(8 + 24 * this.puddle);
    const cx = LEAK.x + 42;
    const rows = [
      { dy: 0, w: half, color: C.waterLo },
      { dy: 2, w: half + 4, color: C.waterLo },
      { dy: 4, w: half, color: C.waterDeep },
    ];
    for (const r of rows) {
      px(ctx, cx - r.w, FLOOR_Y + 2 + r.dy, r.w * 2, PX, r.color);
    }
    const glint = this.env.calm ? 0 : Math.floor(now / 260) % 3;
    px(ctx, cx - half + 6 + glint * 8, FLOOR_Y + 2, 6, PX, C.waterHi);
  }

  // Chorro: tres arcos de agua continuos que salen de la brida, más las
  // gotas sueltas que salpican. Cada arco sigue la parábola de la
  // gravedad hasta el piso; con menos caudal se acortan y se afinan.
  private drawSpray(ctx: CanvasRenderingContext2D, now: number): void {
    const flow = this.flow;
    if (flow < 0.03) {
      if (!this.env.calm) this.drawDrip(ctx, now);
      return;
    }
    const reach = this.env.calm ? 1 : 0.94 + 0.06 * Math.sin(now / 90);
    for (const [j, jet] of JETS.entries()) {
      const vx = jet.vx * flow * reach;
      const vy = jet.vy * flow;
      const fall = FLOOR_Y - LEAK.y;
      const land = (-vy + Math.sqrt(vy * vy + 2 * GRAVITY * fall)) / GRAVITY;
      const steps = Math.max(3, Math.round(14 * Math.min(1, flow + 0.2)));
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * land;
        const x = LEAK.x + vx * t;
        const y = LEAK.y + vy * t + 0.5 * GRAVITY * t * t;
        const wide = flow > 0.55 && i < steps * 0.6 ? PX * 2 : PX;
        px(ctx, x, y, wide, wide, j === 1 ? C.waterHi : C.water);
        if (flow > 0.4 && wide === PX * 2) px(ctx, x, y, PX, PX, C.waterHi);
      }
      if (!this.env.calm)
        this.drawSplash(ctx, now, LEAK.x + vx * land, j, flow);
    }
    const live = Math.ceil(SPRAY_DROPS * flow);
    const clock = this.env.calm ? 0 : now / 1000;
    for (let i = 0; i < live; i++) {
      const h = hash01(i + 1);
      const life = 0.45 + 0.25 * h;
      const t = (((clock + i * 0.137) / life) % 1) * life;
      const vx = (24 + 80 * h) * flow;
      const vy = -(50 + 70 * hash01(i + 40)) * flow;
      const x = LEAK.x + vx * t;
      const y = LEAK.y + vy * t + 0.5 * GRAVITY * t * t;
      if (y >= FLOOR_Y) continue;
      px(ctx, x, y - 4, PX, PX * 2, i % 3 === 0 ? C.waterHi : C.water);
    }
  }

  // Salpicadura donde cae cada arco.
  private drawSplash(
    ctx: CanvasRenderingContext2D,
    now: number,
    x: number,
    jet: number,
    flow: number,
  ): void {
    const k = (now / 220 + jet * 0.33) % 1;
    ctx.globalAlpha = (1 - k) * Math.min(1, flow * 2);
    px(ctx, x - 6 - k * 6, FLOOR_Y - 2 - k * 6, PX, PX, C.waterHi);
    px(ctx, x + 4 + k * 6, FLOOR_Y - 2 - k * 7, PX, PX, C.waterHi);
    px(ctx, x - 1, FLOOR_Y - 4 - k * 8, PX, PX, C.white);
    ctx.globalAlpha = 1;
  }

  // Cuando ya casi no pierde: una gota que cae de vez en cuando.
  private drawDrip(ctx: CanvasRenderingContext2D, now: number): void {
    const t = (now % 1100) / 1100;
    const y = LEAK.y + 4 + t * t * (FLOOR_Y - LEAK.y - 8);
    px(ctx, LEAK.x + 2, y, PX, PX * 2, C.water);
  }

  private drawWheel(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    const { x, y } = g.center;
    const R = VALVE_RADIUS;
    const press = g.holding ? 1 : 0;
    const shake = g.holding && !this.env.calm ? Math.sin(now / 38) * 0.6 : 0;
    const cx = x + shake;
    // Sombra del volante sobre el cuerpo de la válvula.
    ctx.globalAlpha = 0.35;
    pxDisc(ctx, cx + 4, y + 6, R - 2, C.ink);
    ctx.globalAlpha = 1;
    // Aro: borde de tinta, cuerpo coral, luz arriba y sombra abajo.
    pxRing(ctx, cx, y, R - 6, C.ink, 5);
    pxRing(ctx, cx, y, R - 6, C.coral, 3);
    pxRing(ctx, cx, y, R - 9, C.coralHi, 1, Math.PI * 1.05, Math.PI * 1.65);
    pxRing(ctx, cx, y, R - 3, C.coralLo, 1, Math.PI * 0.05, Math.PI * 0.7);
    // Radios que giran.
    for (let i = 0; i < 4; i++) {
      const a = g.angle + (i * Math.PI) / 2;
      pxLine(
        ctx,
        cx,
        y,
        cx + Math.cos(a) * (R - 8),
        y + Math.sin(a) * (R - 8),
        C.ink,
        4,
      );
    }
    for (let i = 0; i < 4; i++) {
      const a = g.angle + (i * Math.PI) / 2;
      pxLine(
        ctx,
        cx,
        y,
        cx + Math.cos(a) * (R - 8),
        y + Math.sin(a) * (R - 8),
        C.coral,
        2,
      );
    }
    // Estela de las agarraderas al girar.
    if (g.holding && !this.env.calm) {
      for (const [back, alpha] of [
        [0.3, 0.3],
        [0.6, 0.15],
      ] as const) {
        ctx.globalAlpha = alpha;
        for (let i = 0; i < 4; i++) {
          const a = g.angle - back + (i * Math.PI) / 2;
          pxDisc(
            ctx,
            cx + Math.cos(a) * (R - 6),
            y + Math.sin(a) * (R - 6),
            6,
            C.amber,
          );
        }
      }
      ctx.globalAlpha = 1;
    }
    // Agarraderas ámbar: se ve girar.
    for (let i = 0; i < 4; i++) {
      const a = g.angle + (i * Math.PI) / 2;
      const kx = cx + Math.cos(a) * (R - 6);
      const ky = y + Math.sin(a) * (R - 6);
      pxDisc(ctx, kx, ky, 8, C.ink);
      pxDisc(ctx, kx, ky, 6, C.amber);
      px(ctx, kx - 4, ky - 4, 4, 2, C.amberHi);
    }
    // Eje.
    pxDisc(ctx, cx, y, 10, C.ink);
    pxDisc(ctx, cx, y, 8, C.coralLo);
    pxDisc(ctx, cx, y, 5, C.coral);
    px(ctx, cx - 4, y - 4, 4, 2, C.coralHi);
    px(ctx, cx - 1, y - 1, 2, 2, press ? C.leafHi : C.amber);
  }

  // Anillo de avance alrededor del volante.
  private drawProgress(ctx: CanvasRenderingContext2D): void {
    const { x, y } = this.game.center;
    const r = VALVE_RADIUS + 10;
    ctx.globalAlpha = 0.4;
    pxRing(ctx, x, y, r, C.ink, 2);
    ctx.globalAlpha = 1;
    if (this.game.fill <= 0) return;
    const start = -Math.PI / 2;
    pxRing(
      ctx,
      x,
      y,
      r,
      C.leaf,
      2,
      start,
      start + this.game.fill * Math.PI * 2,
    );
  }

  // La mano aprieta el volante mientras nadie lo sostiene.
  private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.holding || g.done) return;
    const press = this.env.calm ? 1 : 0.5 + 0.5 * Math.sin(now / 240);
    const { x, y } = g.center;
    drawHand(ctx, x + 6, y + 14, press);
    if (!this.touched || this.env.calm) {
      drawTapRing(ctx, x + 6, y + 14, (now % 900) / 900, C.amber);
    }
  }
}
