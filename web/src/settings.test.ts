import { describe, expect, it } from 'vitest';
import {
  SETTINGS_KEY,
  defaultSettings,
  loadSettings,
  sanitizeSettings,
  saveSettings,
} from './settings';

function fakeStorage(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(SETTINGS_KEY, initial);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('sanitizeSettings', () => {
  const base = defaultSettings();

  it('keeps valid booleans', () => {
    expect(
      sanitizeSettings({ highContrast: true, reduceMotion: true }, base),
    ).toEqual({ highContrast: true, reduceMotion: true });
  });

  it('falls back field by field on bad values', () => {
    expect(
      sanitizeSettings({ highContrast: 'yes', reduceMotion: true }, base),
    ).toEqual({ highContrast: false, reduceMotion: true });
  });

  it('ignores non-objects', () => {
    expect(sanitizeSettings(null, base)).toEqual(base);
    expect(sanitizeSettings('x', base)).toEqual(base);
  });
});

describe('loadSettings / saveSettings', () => {
  it('returns defaults with nothing stored', () => {
    expect(loadSettings(fakeStorage())).toEqual(defaultSettings());
  });

  it('round-trips what was saved', () => {
    const storage = fakeStorage();
    saveSettings({ highContrast: true, reduceMotion: true }, storage);
    expect(loadSettings(storage)).toEqual({
      highContrast: true,
      reduceMotion: true,
    });
  });

  it('survives corrupt JSON and missing storage', () => {
    expect(loadSettings(fakeStorage('{nope'))).toEqual(defaultSettings());
    expect(loadSettings(null)).toEqual(defaultSettings());
    expect(() =>
      saveSettings(defaultSettings(), {
        setItem: () => {
          throw new Error('quota');
        },
      }),
    ).not.toThrow();
  });
});
