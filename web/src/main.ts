import './style.css';
import { gameMap } from './map';
import { type Camera, clampCamera, createCamera, moveCamera } from './canvas/camera';
import { renderMap } from './canvas/renderMap';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d')!;
let camera: Camera = createCamera(gameMap, window.innerWidth, window.innerHeight);

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera = clampCamera({ ...camera, viewWidth: window.innerWidth, viewHeight: window.innerHeight }, gameMap);
}

// Arrow keys only move the camera for now, to test the map (docs/tasks.md, S1-04).
const pressed = new Set<string>();
const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

window.addEventListener('keydown', (e) => {
  if (!ARROWS.has(e.key)) return;
  e.preventDefault();
  pressed.add(e.key);
});
window.addEventListener('keyup', (e) => pressed.delete(e.key));
window.addEventListener('blur', () => pressed.clear());
window.addEventListener('resize', resize);

let last = performance.now();

// One full redraw per animation frame: no partial updates, so no flicker.
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  const dx = Number(pressed.has('ArrowRight')) - Number(pressed.has('ArrowLeft'));
  const dy = Number(pressed.has('ArrowDown')) - Number(pressed.has('ArrowUp'));
  if (dx !== 0 || dy !== 0) camera = moveCamera(camera, gameMap, dx, dy, dt);

  ctx.fillStyle = '#1b2a33';
  ctx.fillRect(0, 0, camera.viewWidth, camera.viewHeight);
  renderMap(ctx, gameMap, camera);
  requestAnimationFrame(frame);
}

resize();
requestAnimationFrame(frame);
