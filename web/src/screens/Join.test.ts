import { describe, expect, it } from 'vitest';
import { ROOM_CODE_RE, normalizeCode } from './Join';

describe('normalizeCode', () => {
  it('uppercases, drops symbols and keeps 4 characters', () => {
    expect(normalizeCode(' ab-c9z ')).toBe('ABC9');
    expect(normalizeCode('k7')).toBe('K7');
  });
});

describe('ROOM_CODE_RE', () => {
  it('accepts match room codes only', () => {
    expect(ROOM_CODE_RE.test('3XKU')).toBe(true);
    // Sin O, 0, I ni 1 para no confundirlos.
    expect(ROOM_CODE_RE.test('O0I1')).toBe(false);
    expect(ROOM_CODE_RE.test('ABC')).toBe(false);
  });
});
