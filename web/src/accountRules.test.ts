import { describe, expect, it } from 'vitest';
import {
  USERNAME_MAX_LEN,
  charCount,
  passwordMissing,
  usernameProblem,
} from './accountRules';

describe('usernameProblem', () => {
  it('accepts letters, numbers and underscore from 3 to 20 characters', () => {
    expect(usernameProblem('abc')).toBeNull();
    expect(usernameProblem('Jose_Antonio_99')).toBeNull();
    expect(usernameProblem('a'.repeat(USERNAME_MAX_LEN))).toBeNull();
  });

  it('rejects names that are too short or too long', () => {
    expect(usernameProblem('ab')).toBe('TOO_SHORT');
    expect(usernameProblem('')).toBe('TOO_SHORT');
    expect(usernameProblem('a'.repeat(USERNAME_MAX_LEN + 1))).toBe('TOO_LONG');
  });

  it('rejects spaces, accents and symbols, as the server does', () => {
    expect(usernameProblem('JOSE ANTONIO PEREZ')).toBe('BAD_CHARS');
    expect(usernameProblem('José')).toBe('BAD_CHARS');
    expect(usernameProblem('niño')).toBe('BAD_CHARS');
    expect(usernameProblem('a-b-c')).toBe('BAD_CHARS');
  });

  it('reports the characters before the length', () => {
    expect(usernameProblem('a b')).toBe('BAD_CHARS');
    expect(usernameProblem('a '.repeat(30))).toBe('BAD_CHARS');
  });
});

describe('passwordMissing', () => {
  it('counts what is left to reach 8 characters', () => {
    expect(passwordMissing('')).toBe(8);
    expect(passwordMissing('1234567')).toBe(1);
    expect(passwordMissing('12345678')).toBe(0);
    expect(passwordMissing('x'.repeat(40))).toBe(0);
  });

  it('counts characters, not UTF-16 units', () => {
    expect(charCount('😀😀')).toBe(2);
    expect(passwordMissing('😀'.repeat(8))).toBe(0);
  });
});
