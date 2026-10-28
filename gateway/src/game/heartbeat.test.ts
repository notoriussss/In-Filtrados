import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Heartbeat } from './heartbeat';

// Reloj e intervalo falsos: la prueba avanza el tiempo a mano.
function fakeTime() {
  let nowMs = 0;
  let tick: (() => void) | null = null;
  return {
    now: () => nowMs,
    setInterval: (fn: () => void) => {
      tick = fn;
      return 1;
    },
    clearInterval: () => {
      tick = null;
    },
    advance(ms: number) {
      for (let i = 0; i < ms / 1000; i++) {
        nowMs += 1000;
        tick?.();
      }
    },
  };
}

test('sin mensajes por 5 s, el socket se da por muerto una vez', () => {
  const time = fakeTime();
  let dead = 0;
  const hb = new Heartbeat({ onDead: () => dead++, ...time });
  hb.start();
  time.advance(4000);
  assert.equal(dead, 0);
  time.advance(1000);
  assert.equal(dead, 1);
  time.advance(10_000);
  assert.equal(dead, 1);
});

test('cada mensaje renueva la espera', () => {
  const time = fakeTime();
  let dead = 0;
  const hb = new Heartbeat({ onDead: () => dead++, ...time });
  hb.start();
  for (let i = 0; i < 10; i++) {
    time.advance(2000);
    hb.seen();
  }
  assert.equal(dead, 0);
});

test('stop no deja que se dispare', () => {
  const time = fakeTime();
  let dead = 0;
  const hb = new Heartbeat({ onDead: () => dead++, ...time });
  hb.start();
  hb.stop();
  time.advance(10_000);
  assert.equal(dead, 0);
});
