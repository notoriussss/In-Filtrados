import { describe, expect, it } from 'vitest';
import { initialScreen } from './session';

describe('initialScreen', () => {
  const base = { token: 't', playerId: 'p', username: 'u' };

  it('without a session goes to login', () => {
    expect(initialScreen(null)).toBe('login');
    expect(initialScreen({ ...base, token: '' })).toBe('login');
  });

  it('with a saved match goes straight to the game', () => {
    expect(initialScreen({ ...base, matchId: 'm1' })).toBe('game');
  });

  it('without a match goes to the lobby', () => {
    expect(initialScreen(base)).toBe('lobby');
    expect(initialScreen({ ...base, matchId: '' })).toBe('lobby');
  });
});
