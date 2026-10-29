import { IDLE_POSE, flourishPose } from '../../render/workPose';
import {
  BOARD,
  STREAM_END_X,
  type StreamGame,
  type StreamKind,
} from '../minigames';
import { drawHand, drawTapRing } from './hand';
import { swingPose } from './particlesScene';
import { type Scene, type SceneEnv, celebrateK } from './scene';
import {
  C,
  PX,
  bakeBoard,
  hash01,
  px,
  spriteFromRows,
  stamp,
} from './pixel';
import { roomLayer } from './room';

// Reciclar (filter-2, Arroyo del ecopunto): limpiar el arroyo. La basura
// baja flotando por un canal hacia la toma de agua del tanque; se saca con
// un clic antes de que llegue a la reja. La que se cuela ensucia el agua.

export const STREAM_HERO_X = 180;
const CHANNEL = { y: 92, h: 98 };
const INTAKE_X = STREAM_END_X + 6;
const ITEM_SCALE = 2;
const SCOOP_MS = 420;
const PUFF_MS = 700;
const MUD = '#8a6a3c';

// Cada basura es un objeto reconocible: botella, bolsa, lata y bota.
type Look = { rows: string[]; palette: Record<string, string> };

const LOOKS: Record<StreamKind, Look> =
  {
    bottle: {
      rows: [
        '...oooo...',
        '...occo...',
        '...obbo...',
        '..obbbbo..',
        '..obhbbo..',
        '..obbbbo..',
        '..obbbbo..',
        '..obbbbo..',
        '..obbbbo..',
        '..oooooo..',
      ],
      palette: { o: C.ink, c: C.coral, b: '#8fd4ff', h: C.white },
    },
    bag: {
      rows: [
        '..oo..oo..',
        '.o..oo..o.',
        '.owwwwwwo.',
        'owwhwwwwwo',
        'owwwwwwwwo',
        'ogwwwwwwgo',
        '.oggggggo.',
        '..oooooo..',
      ],
      palette: { o: C.ink, w: C.white, h: '#ffffff', g: '#b4c4d4' },
    },
    can: {
      rows: [
        '..oooooo..',
        '.ommmmmmo.',
        '.omhhmmmo.',
        '.orrrrrro.',
        '.orrwwrro.',
        '.orrrrrro.',
        '.ommmmmmo.',
        '.ommmmmmo.',
        '.ommmmmmo.',
        '..oooooo..',
      ],
      palette: { o: C.ink, m: C.metal, h: C.metalHi, r: C.coral, w: C.white },
    },
    boot: {
      rows: [
        '.oooo.....',
        '.obbo.....',
        '.obbo.....',
        '.obbbo....',
        '.obbbboooo',
        '.obbbbbbbo',
        'oobbbbbbbo',
        'obhbbbbbbo',
        'oSSSSSSSSo',
        '.oooooooo.',
      ],
      palette: { o: C.ink, b: MUD, h: '#b08c58', S: '#3a2f1e' },
    },
  };

const sprites = new Map<StreamKind, HTMLCanvasElement>();

function itemSprite(kind: StreamKind): HTMLCanvasElement {
  let s = sprites.get(kind);
  if (!s) {
    s = spriteFromRows(LOOKS[kind].rows, LOOKS[kind].palette);
    sprites.set(kind, s);
  }
  return s;
}

// El canal: paredes de metal, fondo de agua y la reja de la toma.
function drawChannel(c: CanvasRenderingContext2D): void {
  const { y, h } = CHANNEL;
  px(c, 0, y - 10, BOARD.w, 10, C.metalInk);
  px(c, 0, y - 8, BOARD.w, 5, C.metalMid);
  px(c, 0, y - 8, BOARD.w, PX, C.metalHi);
  px(c, 0, y + h, BOARD.w, 10, C.metalInk);
  px(c, 0, y + h + 2, BOARD.w, 5, C.metalDark);
  px(c, 0, y, BOARD.w, h, C.waterDeep);
  px(c, 0, y, BOARD.w, 8, C.water);
  // La toma de agua: una reja con su caja.
  px(c, INTAKE_X - 6, y - 14, BOARD.w - INTAKE_X + 6, h + 28, C.metalInk);
  px(c, INTAKE_X - 2, y - 10, BOARD.w - INTAKE_X + 2, h + 20, C.metalDeep);
  for (let x = INTAKE_X + 2; x < BOARD.w - 4; x += 8) {
    px(c, x, y + 2, PX * 2, h - 4, C.ink);
    px(c, x, y + 2, PX, h - 4, C.metalMid);
  }
}

type Scoop = { x: number; y: number; kind: StreamKind; at: number };
type Puff = { y: number; at: number };

export class StreamScene implements Scene {
  private readonly back = bakeBoard((c) => {
    c.drawImage(roomLayer(), 0, 0, BOARD.w, BOARD.h);
    drawChannel(c);
  });
  private readonly kinds = new Map<number, StreamKind>();
  private readonly scoops: Scoop[] = [];
  private readonly puffs: Puff[] = [];
  private dirt = 0; // basura colada: ensucia el agua de la toma
  private swingAt = -1e9;
  private touched = false;
  private doneAt: number | null = null;
  readonly settleMs = 1100;

  constructor(
    private readonly game: StreamGame,
    private readonly env: SceneEnv,
  ) {
    env.hero.lookAt('left');
  }

  get doneSince(): number | null {
    return this.doneAt;
  }

  frame(ctx: CanvasRenderingContext2D, now: number, dt: number): void {
    for (const it of this.game.items) this.kinds.set(it.index, it.kind);
    this.consume(now);
    if (this.game.done && this.doneAt === null) this.doneAt = now;
    ctx.drawImage(this.back, 0, 0, BOARD.w, BOARD.h);
    this.drawRipples(ctx, now);
    this.drawItems(ctx, now);
    this.drawIntakeMud(ctx);
    this.drawScoops(ctx, now);
    this.drawPuffs(ctx, now);
    this.driveHero(now, dt);
    this.env.hero.draw(ctx, now, {
      calm: this.env.calm,
      celebrate: celebrateK(this.doneAt, now),
    });
    this.drawHint(ctx, now);
  }

  private consume(now: number): void {
    for (const e of this.game.drainEvents()) {
      if (e.type === 'pop') {
        const kind = this.kinds.get(e.index) ?? 'bottle';
        this.scoops.push({ x: e.x, y: e.y, kind, at: now });
        this.swingAt = now;
        this.touched = true;
      } else if (e.type === 'spill') {
        this.puffs.push({ y: e.y, at: now });
        this.dirt = Math.min(this.dirt + 1, 5);
      }
    }
  }

  private driveHero(now: number, dt: number): void {
    const hero = this.env.hero;
    hero.lookAt('left');
    if (this.game.done) {
      hero.drive(flourishPose(celebrateK(this.doneAt, now) ?? 0), dt);
      return;
    }
    const since = now - this.swingAt;
    if (since < 420) {
      hero.drive(swingPose(since), dt);
      return;
    }
    const breathe = Math.sin(now / 480);
    hero.drive(
      { ...IDLE_POSE, sy: 1 + 0.012 * breathe, dy: 0.2 * breathe },
      dt,
    );
  }

  // Las rayitas de la corriente avanzan hacia la toma.
  private drawRipples(ctx: CanvasRenderingContext2D, now: number): void {
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < 14; i++) {
      const lane = CHANNEL.y + 14 + hash01(i * 3.1) * (CHANNEL.h - 22);
      const drift = this.env.calm ? 0 : now * 0.05;
      const x = ((hash01(i) * 380 + drift) % (INTAKE_X + 24)) - 12;
      px(ctx, x, lane, 10, PX, C.waterHi);
    }
    ctx.globalAlpha = 1;
  }

  private drawItems(ctx: CanvasRenderingContext2D, now: number): void {
    for (const it of this.game.items) {
      const bob = this.env.calm ? 0 : Math.sin(now / 300 + it.index * 1.7) * 2;
      const tilt = this.env.calm ? 0 : Math.sin(now / 520 + it.index) * 0.16;
      ctx.globalAlpha = 0.25;
      px(ctx, it.x - 9, it.y + 11, 18, PX, C.ink);
      ctx.globalAlpha = 1;
      stamp(ctx, itemSprite(it.kind), it.x, it.y + bob, {
        angle: tilt,
        scale: ITEM_SCALE,
      });
    }
  }

  // El agua de la toma se ensucia con cada basura que se cuela.
  private drawIntakeMud(ctx: CanvasRenderingContext2D): void {
    if (this.dirt === 0) return;
    ctx.globalAlpha = 0.12 * this.dirt;
    px(ctx, INTAKE_X - 60, CHANNEL.y, 60, CHANNEL.h, MUD);
    ctx.globalAlpha = 1;
  }

  // Lo que se saca sube y se desvanece, con un aro de agua.
  private drawScoops(ctx: CanvasRenderingContext2D, now: number): void {
    for (let i = this.scoops.length - 1; i >= 0; i--) {
      const s = this.scoops[i];
      const k = (now - s.at) / SCOOP_MS;
      if (k >= 1) {
        this.scoops.splice(i, 1);
        continue;
      }
      const rise = this.env.calm ? 0 : 18 * k;
      ctx.globalAlpha = 1 - k;
      stamp(ctx, itemSprite(s.kind), s.x, s.y - rise, {
        scale: ITEM_SCALE * (1 - 0.3 * k),
        angle: k * 0.8,
      });
      if (!this.env.calm) {
        ctx.strokeStyle = C.waterHi;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y + 8, 8 + k * 14, 3 + k * 5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  // Una nube marrón en la reja cuando se cuela algo.
  private drawPuffs(ctx: CanvasRenderingContext2D, now: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      const k = (now - p.at) / PUFF_MS;
      if (k >= 1) {
        this.puffs.splice(i, 1);
        continue;
      }
      if (this.env.calm) continue;
      ctx.globalAlpha = (1 - k) * 0.7;
      for (let j = 0; j < 4; j++) {
        px(ctx, INTAKE_X - 10 - j * 6 - k * 10, p.y - 8 + j * 4, 10, 8, MUD);
      }
      ctx.globalAlpha = 1;
    }
  }

  // La basura que va por llegar a la reja se marca en rojo; hasta el
  // primer acierto, la mano señala la primera desde abajo.
  private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.done || g.items.length === 0) return;
    const lead = g.items.reduce((a, b) => (b.x > a.x ? b : a));
    if (lead.x > STREAM_END_X - 90 && !this.env.calm) {
      drawTapRing(ctx, lead.x, lead.y, (now % 600) / 600, C.coral);
    } else if (!this.touched) {
      drawTapRing(ctx, lead.x, lead.y, this.env.calm ? 0.3 : (now % 900) / 900);
    }
    if (this.touched) return;
    const press = this.env.calm ? 1 : 0.5 + 0.5 * Math.sin(now / 240);
    drawHand(ctx, lead.x + 12, lead.y + 22, press);
  }
}
