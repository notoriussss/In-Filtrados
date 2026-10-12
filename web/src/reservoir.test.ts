import { describe, expect, it } from 'vitest';
import { RESERVOIR_TEXT } from './constants';

describe('RESERVOIR_TEXT', () => {
  it('formats reservoir level label correctly', () => {
    expect(RESERVOIR_TEXT.label(42)).toBe('Embalse 42 %');
    expect(RESERVOIR_TEXT.label(0)).toBe('Embalse 0 %');
    expect(RESERVOIR_TEXT.label(100)).toBe('Embalse 100 %');
  });
});
