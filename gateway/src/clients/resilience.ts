import { Logger } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import CircuitBreaker from 'opossum';

export const RETRY_DELAYS_MS: readonly number[] = [200, 400, 800];

const RETRYABLE_CODES = new Set<number>([
  status.UNAVAILABLE,
  status.DEADLINE_EXCEEDED,
]);

export const CIRCUIT_OPEN = 'circuit-open';

export const BREAKER_OPTIONS: CircuitBreaker.Options = {
  timeout: false,
  errorThresholdPercentage: 50,
  volumeThreshold: 10,
  rollingCountTimeout: 10_000,
  resetTimeout: 10_000,
};

const logger = new Logger('Resilience');
const breakers = new Map<string, CircuitBreaker>();

export function isTransient(err: any): boolean {
  const code = err?.code;
  return (
    typeof code === 'number' &&
    RETRYABLE_CODES.has(code) &&
    err?.details !== CIRCUIT_OPEN
  );
}

export async function withRetry<T>(
  call: () => Promise<T>,
  delays: readonly number[] = RETRY_DELAYS_MS,
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await call();
    } catch (err) {
      if (i >= delays.length || !isTransient(err)) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delays[i]));
    }
  }
}

export function createBreaker(
  service: string,
  options: CircuitBreaker.Options = BREAKER_OPTIONS,
): CircuitBreaker {
  const breaker = new CircuitBreaker(
    (call: () => Promise<unknown>) => call(),
    {
      ...options,
      // Business errors (NOT_FOUND, ALREADY_EXISTS...) do not trip it.
      errorFilter: (err) => !isTransient(err),
    },
  );

  breaker.on('open', () => logger.warn(`${service}: open`));
  breaker.on('halfOpen', () => logger.log(`${service}: halfOpen`));
  breaker.on('close', () => logger.log(`${service}: close`));

  breakers.set(service, breaker);
  return breaker;
}

async function fire<T>(
  breaker: CircuitBreaker,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return (await breaker.fire(call)) as T;
  } catch (err: any) {
    if (err?.code === 'EOPENBREAKER') {
      throw {
        code: status.UNAVAILABLE,
        details: CIRCUIT_OPEN,
      };
    }
    throw err;
  }
}

export function guarded<T>(
  breaker: CircuitBreaker,
  call: () => Promise<T>,
  retry = true,
): Promise<T> {
  const once = () => fire(breaker, call);
  return retry ? withRetry(once) : once();
}

export function isCircuitOpen(service: string): boolean {
  return breakers.get(service)?.opened ?? false;
}
