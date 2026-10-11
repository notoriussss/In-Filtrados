import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatDeduper } from './chat-dedupe';

test('a clientMsgId passes once per match', () => {
  const d = new ChatDeduper();
  assert.equal(d.firstTime('m1', 'c1'), true);
  assert.equal(d.firstTime('m1', 'c1'), false);
  assert.equal(d.firstTime('m1', 'c2'), true);
  // Otra partida tiene su propia lista.
  assert.equal(d.firstTime('m2', 'c1'), true);
});

test('memory is bounded per match and in matches', () => {
  const d = new ChatDeduper(2, 2);
  d.firstTime('m1', 'a');
  d.firstTime('m1', 'b');
  d.firstTime('m1', 'c'); // olvida 'a'
  assert.equal(d.firstTime('m1', 'a'), true);
  d.firstTime('m2', 'x');
  d.firstTime('m3', 'y'); // olvida m1
  assert.equal(d.firstTime('m1', 'b'), true);
});

test(
  'drops duplicate in flight but allows retry after in-flight window',
  () => {
    const d = new ChatDeduper(500, 200, 3000);
    const t0 = 10_000;
    // Primer envío: pasa a match
    assert.equal(d.firstTime('m1', 'c1', t0), true);

    // Reenvío inmediato a 1s (en vuelo): el gateway lo bota
    assert.equal(d.firstTime('m1', 'c1', t0 + 1000), false);

    // Si match no lo aceptó (pausa o espera), cliente reintenta a 3.5s:
    // Pasó la ventana en vuelo: vuelve a pasar hacia match
    assert.equal(d.firstTime('m1', 'c1', t0 + 3500), true);
  },
);

