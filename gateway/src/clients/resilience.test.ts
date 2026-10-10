import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { status } from '@grpc/grpc-js';
import {
  CIRCUIT_OPEN,
  createBreaker,
  guarded,
  withRetry,
} from './resilience';

test('retries transient errors and succeeds on eventual success', async () => {
  let calls = 0;
  const fn = async () => {
    calls++;
    if (calls < 3) {
      throw { code: status.UNAVAILABLE, details: 'down' };
    }
    return 'ok';
  };
  const result = await withRetry(fn, [1, 1, 1]);
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});

test(
  'gives up and throws after exhausting retries on UNAVAILABLE',
  async () => {
  let calls = 0;
  const fn = async () => {
    calls++;
    throw { code: status.UNAVAILABLE, details: 'down' };
  };
  await assert.rejects(
    () => withRetry(fn, [1, 1, 1]),
    (err: any) => err.code === status.UNAVAILABLE,
  );
  assert.equal(calls, 4);
});

test('does not retry business errors like NOT_FOUND', async () => {
  let calls = 0;
  const fn = async () => {
    calls++;
    throw { code: status.NOT_FOUND, details: 'no' };
  };
  await assert.rejects(
    () => withRetry(fn, [1, 1, 1]),
    (err: any) => err.code === status.NOT_FOUND,
  );
  assert.equal(calls, 1);
});

test('opens breaker after failure threshold and fails fast', async () => {
  const breaker = createBreaker('t1');
  try {
    for (let i = 0; i < 10; i++) {
      await assert.rejects(
        () =>
          guarded(
            breaker,
            async () => {
              throw { code: status.UNAVAILABLE, details: 'down' };
            },
            false,
          ),
      );
    }
    assert.equal(breaker.opened, true);

    let executed = false;
    await assert.rejects(
      () =>
        guarded(
          breaker,
          async () => {
            executed = true;
            return 'ok';
          },
          false,
        ),
      (err: any) =>
        err.code === status.UNAVAILABLE &&
        err.details === CIRCUIT_OPEN,
    );
    assert.equal(executed, false);
  } finally {
    breaker.shutdown();
  }
});

test('business errors do not trip the circuit breaker', async () => {
  const breaker = createBreaker('t2');
  try {
    for (let i = 0; i < 20; i++) {
      await assert.rejects(
        () =>
          guarded(
            breaker,
            async () => {
              throw { code: status.NOT_FOUND, details: 'no' };
            },
            false,
          ),
      );
    }
    assert.equal(breaker.opened, false);
  } finally {
    breaker.shutdown();
  }
});
