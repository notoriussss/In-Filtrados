import {
  FLOURISH_MS,
  IDLE_POSE,
  REACH,
  TUCK,
  flourishPose,
} from '../../render/workPose';
import {
  BOARD,
  type WaterKind,
  WATERING_HOME,
  WATERING_KINDS,
  WATERING_PLOT,
  WATERING_SIZE,
  WATERING_TREAT,
  type WateringGame,
} from '../minigames';
import { drawDropZone, type ZoneTone } from './dragHelpers';
import { drawHand, drawTapRing } from './hand';
import { type Scene, type SceneEnv, celebrateK } from './scene';
import {
  C,
  PX,
  bakeBoard,
  clamp01,
  px,
  spriteFromRows,
  stamp,
} from './pixel';
import { roomLayer } from './room';

// Reutilizar (greywater-2): ¿sirve para regar? Aparece un recipiente
// con el dibujo de su origen y se arrastra a Regar (la planta) o a
// Tratar (la caja de tratamiento). Errar lo devuelve a la mesa.

const TABLE = { x: 140, y: 170, w: 80, h: 26 };
export const WATERING_HERO_X = 126;
// Frasco con agua gris: el color y lo que flota arriba dependen del
// origen (F y f son lo que flota).
const CUP_ROWS = [
  '.oooooooooo.',
  '.oFfFfFfFfo.',
  '.oLLLLLLLLo.',
  '.oLLLLLLLLo.',
  '.oLLLLLLLLo.',
  '.oLLLLLLLLo.',
  '.oLLLLLLLLo.',
  '.oooooooooo.',
];

type Look = { rows: string[]; palette: Record<string, string> };

// Cada recipiente se dibuja con su origen, a color, para que se
// reconozca sin leer nada: tomate (verduras), camiseta (ropa), botella de
// aceite y botella de cloro con su «!».
const ORIGINS: Look[] = [
  {
    rows: [
      '......gg......',
      '....ggGGgg....',
      '.....gGGg.....',
      '...oooooooo...',
      '..orrrrrrrro..',
      '.orrhhrrrrrro.',
      '.orhhrrrrrrro.',
      '.orrrrrrrrrro.',
      '.orrrrrrrrrro.',
      '.orrrrrrrrrro.',
      '..orrrrrrrro..',
      '...oooooooo...',
    ],
    palette: {
      o: C.ink,
      r: C.coral,
      h: C.coralHi,
      g: C.leaf,
      G: C.leafLo,
    },
  },
  {
    rows: [
      '..oooo..oooo..',
      '.oBBBBooBBBBo.',
      'oBBBBBBBBBBBBo',
      'ooBBBBBBBBBBoo',
      '.oBwwwwwwwwBo.',
      '.oBBBBBBBBBBo.',
      '.oBwwwwwwwwBo.',
      '.oBBBBBBBBBBo.',
      '.oBBBBBBBBBBo.',
      '.oooooooooooo.',
    ],
    palette: { o: C.ink, B: C.water, w: C.white },
  },
  {
    rows: [
      '.....oooo.....',
      '.....ommo.....',
      '.....oyyo.....',
      '.....oyyo.....',
      '....oyhyyo....',
      '...oyhyyyyo...',
      '...oyyyyyyo...',
      '...owwddwwo...',
      '...owwddwwo...',
      '...oyyyyyyo...',
      '...oyyyyyyo...',
      '...oooooooo...',
    ],
    palette: {
      o: C.ink,
      m: '#8a5a2c',
      y: C.amber,
      h: C.amberHi,
      w: C.white,
      d: '#8a5a2c',
    },
  },
  {
    rows: [
      '....oooooo....',
      '....occcco....',
      '.....owwo.....',
      '....owwwwo....',
      '...owwwwwwo...',
      '...orrrrrro...',
      '...orrwwrro...',
      '...orrwwrro...',
      '...orrrrrro...',
      '...orrwwrro...',
      '...owwwwwwo...',
      '...owwwwwwo...',
      '...oooooooo...',
    ],
    palette: { o: C.ink, c: C.water, w: C.white, r: C.coral },
  },
];

// El agua de cada frasco: murky con hojitas, jabonosa, con aceite
// flotando y verdosa por el cloro.
const WATER_LOOKS: Record<string, string>[] = [
  { L: '#9aa890', F: C.leaf, f: C.leafLo },
  { L: '#b4c4d4', F: C.white, f: C.waterHi },
  { L: '#8a9aa6', F: C.amber, f: C.amberHi },
  { L: '#9ad6c8', F: '#c8ff7a', f: '#9ad6c8' },
];

const originSprites = ORIGINS.map((o) =>
  spriteFromRows(o.rows, o.palette),
);
const cupSprites = WATER_LOOKS.map((w) =>
  spriteFromRows(CUP_ROWS, { o: C.ink, ...w }),
);

// Iconos de las dos cajas: una planta que se riega y un embudo que trata.
const SPROUT_ROWS = [
  '.gg...gg.',
  'gggg.gggg',
  '.gggGggg.',
  '....G....',
  '....G....',
  '..GGGGG..',
];
const FUNNEL_ROWS = [
  'wwwwwwwww',
  '.wwwwwww.',
  '..wwwww..',
  '...www...',
  '....w....',
  '..d.w.d..',
  '..d...d..',
];
const sproutSprite = spriteFromRows(SPROUT_ROWS, {
  g: C.leaf,
  G: C.leafLo,
});
const funnelSprite = spriteFromRows(FUNNEL_ROWS, {
  w: C.white,
  d: C.waterHi,
});

// Placa con su icono: verde para regar, ámbar para tratar.
function drawPlaque(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  icon: HTMLCanvasElement,
  edge: string,
): void {
  px(c, cx - 24, cy - 20, 48, 40, C.ink);
  px(c, cx - 22, cy - 18, 44, 36, edge);
  px(c, cx - 20, cy - 16, 40, 32, C.wallHi);
  stamp(c, icon, cx, cy, { scale: 2 });
}

function drawPot(c: CanvasRenderingContext2D): void {
  const p = WATERING_PLOT;
  // Maceta con una planta: regar.
  px(c, p.x + 12, p.y + 12, p.w - 24, p.h - 12, C.metalInk);
  px(c, p.x + 14, p.y + 14, p.w - 28, p.h - 16, C.coralLo);
  px(c, p.x + 14, p.y + 14, p.w - 28, 4, C.coral);
  px(c, p.x + 10, p.y + 8, p.w - 20, 8, C.metalInk);
  px(c, p.x + 12, p.y + 10, p.w - 24, 4, C.coralHi);
  // Hojas de la planta.
  px(c, p.x + p.w / 2 - 2, p.y - 4, PX, 16, C.leafLo);
  px(c, p.x + p.w / 2 - 12, p.y - 8, 10, 6, C.leaf);
  px(c, p.x + p.w / 2 + 3, p.y - 12, 10, 6, C.leaf);
  px(c, p.x + p.w / 2 - 10, p.y - 6, 6, PX, C.leafHi);
  px(c, p.x + p.w / 2 + 5, p.y - 10, 6, PX, C.leafHi);
  drawPlaque(c, p.x + p.w / 2, p.y + 50, sproutSprite, C.leaf);
}

// Caja de tratamiento: embudo, rejilla y luz.
function drawTreat(c: CanvasRenderingContext2D): void {
  const t = WATERING_TREAT;
  px(c, t.x + 6, t.y + 12, t.w - 12, t.h - 12, C.metalInk);
  px(c, t.x + 8, t.y + 14, t.w - 16, t.h - 16, C.metalDark);
  px(c, t.x + 8, t.y + 14, t.w - 16, PX, C.metalMid);
  // Embudo arriba.
  px(c, t.x + 18, t.y + 2, t.w - 36, 12, C.metalInk);
  px(c, t.x + 20, t.y + 4, t.w - 40, 8, C.metalDeep);
  px(c, t.x + 20, t.y + 4, t.w - 40, PX, C.metalHi);
  // Rejilla de filtros al frente.
  for (let y = t.y + 26; y < t.y + t.h - 10; y += 8) {
    px(c, t.x + 12, y, t.w - 24, PX, C.metalInk);
  }
  px(c, t.x + t.w - 18, t.y + 18, 8, 6, C.amber);
  drawPlaque(c, t.x + t.w / 2, t.y + 52, funnelSprite, C.amber);
}

export class WateringScene implements Scene {
  private readonly back = bakeBoard((c) => {
    c.drawImage(roomLayer(), 0, 0, BOARD.w, BOARD.h);
    drawPot(c);
    drawTreat(c);
    // Mesa del centro, encima de las patas.
    px(c, TABLE.x - 4, TABLE.y - 4, TABLE.w + 8, TABLE.h + 8, C.metalInk);
    px(c, TABLE.x, TABLE.y, TABLE.w, 6, C.metal);
    px(c, TABLE.x, TABLE.y, TABLE.w, PX, C.metalHi);
    px(c, TABLE.x, TABLE.y + 6, TABLE.w, TABLE.h - 6, C.metalInk);
    for (const x of [TABLE.x + 8, TABLE.x + TABLE.w - 18]) {
      px(c, x, TABLE.y + TABLE.h, 10, 228 - TABLE.y - TABLE.h, C.metalInk);
    }
  });
  private readonly ghosts: {
    at: number;
    left: boolean;
    x: number;
    y: number;
    index: number;
  }[] = [];
  private readonly shown = {
    x: WATERING_HOME.x,
    y: WATERING_HOME.y,
    tilt: 0,
    lift: 0,
  };
  private cheerAt = -1e9;
  private shrugAt = -1e9;
  private touched = false;
  private doneAt: number | null = null;
  readonly settleMs = 1100;

  constructor(
    private readonly game: WateringGame,
    private readonly env: SceneEnv,
  ) {
    env.hero.lookAt('right');
  }

  get doneSince(): number | null {
    return this.doneAt;
  }

  frame(ctx: CanvasRenderingContext2D, now: number, dt: number): void {
    this.consume(now);
    this.update(dt);
    if (this.game.done && this.doneAt === null) this.doneAt = now;
    ctx.drawImage(this.back, 0, 0, BOARD.w, BOARD.h);
    this.drawZones(ctx, now);
    this.drawCurrent(ctx, now);
    this.driveHero(now, dt);
    this.env.hero.draw(ctx, now, {
      calm: this.env.calm,
      celebrate: celebrateK(this.doneAt, now),
    });
    this.drawGhosts(ctx, now);
    this.drawHint(ctx, now);
  }

  private consume(now: number): void {
    for (const e of this.game.drainEvents()) {
      if (e.type === 'drop-in') {
        this.ghosts.push({
          at: now,
          left: e.x < BOARD.w / 2,
          x: e.x,
          y: e.y,
          index: e.index,
        });
        this.cheerAt = now;
        this.touched = true;
      } else if (e.type === 'drop-out') {
        this.shrugAt = now;
        this.touched = true;
      } else if (e.type === 'grab') {
        this.shown.lift = 1;
      }
    }
  }

  private update(dt: number): void {
    const i = this.game.current;
    if (i < 0) return;
    const it = this.game.items[i];
    const dragging = this.game.dragging === i;
    const k = dragging
      ? 1 - Math.exp((-dt / 1000) * 22)
      : 1 - Math.exp((-dt / 1000) * 14);
    this.shown.x += (it.x - this.shown.x) * k;
    this.shown.y += (it.y - this.shown.y) * k;
    const vx = (it.x - this.shown.x) / Math.max(dt, 1);
    const tilt =
      dragging && !this.env.calm
        ? Math.max(-0.4, Math.min(0.4, vx * 1.3))
        : 0;
    this.shown.tilt +=
      (tilt - this.shown.tilt) * (1 - Math.exp((-dt / 1000) * 12));
    if (!dragging) {
      this.shown.lift +=
        (0 - this.shown.lift) * (1 - Math.exp((-dt / 1000) * 10));
    }
  }

  private driveHero(now: number, dt: number): void {
    const g = this.game;
    const hero = this.env.hero;
    if (g.done) {
      hero.lookAt('right');
      hero.drive(flourishPose(celebrateK(this.doneAt, now) ?? 0), dt);
      return;
    }
    if (g.dragging !== null) {
      const it = g.items[g.dragging];
      const left = it.x + WATERING_SIZE / 2 < WATERING_HERO_X;
      hero.lookAt(left ? 'left' : 'right');
      const reach = clamp01(
        Math.abs(it.x + WATERING_SIZE / 2 - WATERING_HERO_X) / 100,
      );
      const s = Math.sin(now / 130);
      hero.drive(
        {
          ...IDLE_POSE,
          frame: s > 0 ? REACH : TUCK,
          lean: 1.5 + 3 * reach,
          dy: -0.9 * Math.abs(s),
          strain: 0.7,
        },
        dt,
      );
      return;
    }
    const since = now - this.cheerAt;
    if (since < FLOURISH_MS) {
      hero.lookAt('right');
      hero.drive(flourishPose(since / FLOURISH_MS), dt);
      return;
    }
    const sinceShrug = now - this.shrugAt;
    if (sinceShrug < 420 && !this.env.calm) {
      const wobble = Math.sin(sinceShrug / 38) * (1 - sinceShrug / 420);
      hero.drive({ ...IDLE_POSE, dx: 2.2 * wobble, sy: 0.97 }, dt);
      return;
    }
    const breathe = Math.sin(now / 480);
    hero.lookAt('right');
    hero.drive(
      { ...IDLE_POSE, lean: 1.2, sy: 1 + 0.012 * breathe, dy: 0.2 * breathe },
      dt,
    );
  }

  // La caja bajo el recipiente: verde si caería bien, rojo si no.
  private drawZones(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.dragging === null) return;
    const it = g.items[g.dragging];
    const cx = it.x + WATERING_SIZE / 2;
    const cy = it.y + WATERING_SIZE / 2;
    const overPlot =
      cx >= WATERING_PLOT.x - 6 &&
      cx <= WATERING_PLOT.x + WATERING_PLOT.w + 6 &&
      cy >= WATERING_PLOT.y - 6 &&
      cy <= WATERING_PLOT.y + WATERING_PLOT.h + 6;
    const overTreat =
      cx >= WATERING_TREAT.x - 6 &&
      cx <= WATERING_TREAT.x + WATERING_TREAT.w + 6 &&
      cy >= WATERING_TREAT.y - 6 &&
      cy <= WATERING_TREAT.y + WATERING_TREAT.h + 6;
    if (!overPlot && !overTreat) return;
    const kind: WaterKind = overPlot ? 'water' : 'treat';
    const tone: ZoneTone =
      WATERING_KINDS[it.index] === kind ? 'good' : 'bad';
    drawDropZone(
      ctx,
      overPlot ? WATERING_PLOT : WATERING_TREAT,
      now,
      this.env.calm,
      tone,
    );
  }

  // El recipiente que toca, con el cartel de su origen.
  private drawCurrent(ctx: CanvasRenderingContext2D, now: number): void {
    const i = this.game.current;
    if (i < 0) return;
    const it = this.game.items[i];
    if (it.placed) return;
    const cx = this.shown.x + WATERING_SIZE / 2;
    const cy = this.shown.y + WATERING_SIZE / 2;
    stamp(ctx, cupSprites[i], cx, cy - 2 * this.shown.lift, {
      angle: this.shown.tilt,
    });
    // Cartel del origen sobre el recipiente, con una leve ola: el dibujo
    // a color es lo que el jugador usa para decidir.
    const bob = this.env.calm ? 0 : Math.sin(now / 320) * 1.5;
    const top = Math.max(2, cy - 56 + bob);
    px(ctx, cx - 22, top, 44, 38, C.ink);
    px(ctx, cx - 20, top + 2, 40, 34, C.wallHi);
    px(ctx, cx - 20, top + 2, 40, PX, C.lineHi);
    px(ctx, cx - 2, top + 38, 4, 4, C.ink);
    stamp(ctx, originSprites[i], cx, top + 19);
  }

  // El acertado vuela hasta su caja y se vacía ahí.
  private drawGhosts(ctx: CanvasRenderingContext2D, now: number): void {
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const gh = this.ghosts[i];
      const t = (now - gh.at) / 320;
      if (t >= 1) {
        this.ghosts.splice(i, 1);
        continue;
      }
      const target = gh.left ? WATERING_PLOT : WATERING_TREAT;
      const k = t * t * (3 - 2 * t);
      const x = gh.x + (target.x + target.w / 2 - gh.x) * k;
      const y =
        gh.y +
        (target.y + target.h * 0.6 - gh.y) * k -
        Math.sin(Math.PI * k) * 22;
      ctx.globalAlpha = 1 - t * 0.4;
      stamp(ctx, cupSprites[gh.index], x, y, { angle: k * 3 });
      ctx.globalAlpha = 1;
    }
  }

  // La mano agarra el recipiente que toca.
  private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.dragging !== null || g.done || this.game.current < 0) return;
    const press = this.env.calm ? 1 : 0.5 + 0.5 * Math.sin(now / 240);
    drawHand(ctx, this.shown.x - 8, this.shown.y + 12, press);
    if (!this.touched) {
      drawTapRing(
        ctx,
        this.shown.x + WATERING_SIZE / 2,
        this.shown.y + WATERING_SIZE / 2,
        this.env.calm ? 0.3 : (now % 900) / 900,
      );
    }
  }
}
