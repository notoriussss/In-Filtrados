import express from 'express';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LoginThrottlerGuard } from './login-throttler.guard';

// El tracker del guard no usa el resto de las dependencias, así que se
// construye con placeholders.
function guard(): LoginThrottlerGuard {
  return new LoginThrottlerGuard(
    {} as never,
    {} as never,
    {} as never,
  );
}

test(
  'el tracker usa username normalizado en minúsculas y con trim',
  async () => {
    const tracker = await (guard() as any).getTracker({
      body: { username: '  PlayerOne ' },
      ip: '203.0.113.7',
    });
    assert.equal(tracker, 'user:playerone');
  },
);

test(
  'el mismo usuario con IPs distintas comparte el tracker',
  async () => {
    const trackerA = await (guard() as any).getTracker({
      body: { username: 'ana' },
      ip: '10.0.0.1',
    });
    const trackerB = await (guard() as any).getTracker({
      body: { username: 'ana' },
      ip: '192.168.1.50',
    });
    assert.equal(trackerA, trackerB);
  },
);

test(
  'usuarios distintos con la misma IP tienen trackers separados',
  async () => {
    const tracker1 = await (guard() as any).getTracker({
      body: { username: 'ana' },
      ip: '192.168.1.50',
    });
    const tracker2 = await (guard() as any).getTracker({
      body: { username: 'bob' },
      ip: '192.168.1.50',
    });
    assert.notEqual(tracker1, tracker2);
    assert.equal(tracker1, 'user:ana');
    assert.equal(tracker2, 'user:bob');
  },
);

test(
  'sin username en el cuerpo el tracker hace fallback a ip:${req.ip}',
  async () => {
    const tracker = await (guard() as any).getTracker({
      body: {},
      ip: '172.18.0.2',
    });
    assert.equal(tracker, 'ip:172.18.0.2');
  },
);

test(
  'con username en blanco el tracker hace fallback a ip:${req.ip}',
  async () => {
    const tracker = await (guard() as any).getTracker({
      body: { username: '   ' },
      ip: '172.18.0.2',
    });
    assert.equal(tracker, 'ip:172.18.0.2');
  },
);

test(
  'trust proxy solo confía en la subred de Docker y loopback',
  () => {
    const app = express();
    app.set('trust proxy', 'loopback, 172.16.0.0/12');
    const trust = app.get('trust proxy fn');
    assert.equal(trust('127.0.0.1', 0), true);
    assert.equal(trust('::1', 0), true);
    assert.equal(trust('172.18.0.2', 0), true);
    assert.equal(trust('172.20.0.5', 0), true);
    assert.equal(trust('192.168.10.21', 0), false);
    assert.equal(trust('10.0.0.1', 0), false);
  },
);
