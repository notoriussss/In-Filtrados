import './style.css';
import type { PlayerView } from '@in-filtrados/messages';
import { gameMap } from './map';
import { type Camera, clampCamera, createCamera } from './canvas/camera';
import { renderMap } from './canvas/renderMap';
import { renderPlayers } from './canvas/renderPlayers';
import { connect } from './net/socket';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d')!;
let camera: Camera = createCamera(
  gameMap,
  window.innerWidth,
  window.innerHeight,
);

// S1-07: random id per tab, no login yet. The server decides every position.
// randomUUID needs https outside localhost, so Math.random is used here.
const meId = Math.random().toString(36).slice(2, 10);
let players: PlayerView[] = [];
const send = connect(meId, (msg) => {
  if (msg.type === 'snapshot') {
    players = msg.players;
  } else {
    console.warn(msg.code, msg.message);
  }
});

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

// The arrows only send the direction, and only when it changes.
const pressed = new Set<string>();
const ARROWS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);
let lastDx = 0;
let lastDy = 0;

function sendDirection(): void {
  const right = Number(pressed.has('ArrowRight'));
  const left = Number(pressed.has('ArrowLeft'));
  const down = Number(pressed.has('ArrowDown'));
  const up = Number(pressed.has('ArrowUp'));
  const dx = (right - left) as -1 | 0 | 1;
  const dy = (down - up) as -1 | 0 | 1;

  if (dx === lastDx && dy === lastDy) return;
  lastDx = dx;
  lastDy = dy;
  send({ type: 'move', dx, dy });
}

window.addEventListener('keydown', (e) => {
  if (!ARROWS.has(e.key)) return;
  e.preventDefault();
  pressed.add(e.key);
  sendDirection();
});
window.addEventListener('keyup', (e) => {
  pressed.delete(e.key);
  sendDirection();
});
window.addEventListener('blur', () => {
  pressed.clear();
  sendDirection();
});
window.addEventListener('resize', resize);

// One full redraw per animation frame: no partial updates, so no flicker.
function frame(): void {
  const me = players.find((p) => p.id === meId);
  if (me) {
    camera = clampCamera({ ...camera, x: me.x, y: me.y }, gameMap);
  }

  ctx.fillStyle = '#1b2a33';
  ctx.fillRect(0, 0, camera.viewWidth, camera.viewHeight);
  renderMap(ctx, gameMap, camera);
  renderPlayers(ctx, players, camera, meId);
  requestAnimationFrame(frame);
}

resize();
requestAnimationFrame(frame);
