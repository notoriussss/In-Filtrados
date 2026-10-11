import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FloodLimiter, TokenBucket } from './rate-limit';

// Reloj falso: el bucket nunca mira la hora real en las pruebas.
function fakeClock(startMs = 0) {
  let nowMs = startMs;
  return {
    now: () => nowMs,
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

test('un bucket lleno deja pasar 30 mensajes y descarta el 31', () => {
  const clock = fakeClock();
  const bucket = new TokenBucket(30, 30, clock.now);
  for (let i = 1; i <= 30; i++) {
    assert.equal(bucket.tryConsume(), true, `mensaje ${i}`);
  }
  assert.equal(bucket.tryConsume(), false);
});

test('la recarga es proporcional al tiempo transcurrido', () => {
  const clock = fakeClock();
  const bucket = new TokenBucket(30, 30, clock.now);
  for (let i = 0; i < 30; i++) bucket.tryConsume();
  assert.equal(bucket.tryConsume(), false);

  clock.advance(500); // medio segundo: 15 mensajes
  for (let i = 1; i <= 15; i++) {
    assert.equal(bucket.tryConsume(), true, `mensaje ${i} a los 500 ms`);
  }
  assert.equal(bucket.tryConsume(), false);
});

test('un segundo completo devuelve 30 mensajes', () => {
  const clock = fakeClock();
  const bucket = new TokenBucket(30, 30, clock.now);
  for (let i = 0; i < 30; i++) bucket.tryConsume();
  clock.advance(1000);
  let allowed = 0;
  for (let i = 0; i < 31; i++) if (bucket.tryConsume()) allowed++;
  assert.equal(allowed, 30);
});

test('una calma larga no acumula más que la capacidad', () => {
  const clock = fakeClock();
  const bucket = new TokenBucket(30, 30, clock.now);
  for (let i = 0; i < 30; i++) bucket.tryConsume();
  clock.advance(60_000); // un minuto en reposo
  let allowed = 0;
  for (let i = 0; i < 1000; i++) if (bucket.tryConsume()) allowed++;
  assert.equal(allowed, 30);
});

test('tras 3 avisos el limiter pide cerrar la conexión', () => {
  const clock = fakeClock();
  const limiter = new FloodLimiter(new TokenBucket(30, 30, clock.now), 3);
  for (let i = 0; i < 30; i++) {
    assert.equal(limiter.check(), 'allow', `mensaje ${i + 1}`);
  }
  assert.equal(limiter.check(), 'warn'); // 1.er aviso
  assert.equal(limiter.check(), 'warn'); // 2.º aviso
  assert.equal(limiter.check(), 'close'); // 3.er aviso y cierre
});

test('el flood de una conexión no toca a la otra', () => {
  const clock = fakeClock();
  const flooded = new FloodLimiter(new TokenBucket(30, 30, clock.now), 3);
  const other = new FloodLimiter(new TokenBucket(30, 30, clock.now), 3);

  for (let i = 0; i < 100; i++) flooded.check();
  assert.equal(flooded.check(), 'close');

  for (let i = 0; i < 30; i++) {
    assert.equal(other.check(), 'allow', `mensaje de la otra conexión ${i}`);
  }
  assert.equal(other.check(), 'warn');
});
