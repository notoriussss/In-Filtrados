import { describe, expect, it } from 'vitest';
import { newClientMsgId } from './ids';

describe('newClientMsgId', () => {
  it('returns a v4 UUID', () => {
    const id = newClientMsgId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('never repeats', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newClientMsgId()));
    expect(ids.size).toBe(1000);
  });
});
