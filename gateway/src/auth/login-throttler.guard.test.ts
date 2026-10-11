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
  'el tracker usa req.ip y no la primera IP de X-Forwarded-For',
  async () => {
    const tracker = await (guard() as any).getTracker({
      ip: '203.0.113.7',
      ips: ['10.0.0.1', '203.0.113.7'],
    });
    assert.equal(tracker, '203.0.113.7');
    assert.notEqual(tracker, '10.0.0.1');
  },
);

test(
  'sin cabecera X-Forwarded-For el tracker es la IP de la conexión',
  async () => {
    const tracker = await (guard() as any).getTracker({
      ip: '172.18.0.2',
      ips: [],
    });
    assert.equal(tracker, '172.18.0.2');
  },
);
