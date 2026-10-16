import { describe, expect, it, vi } from 'vitest';
import type { PlayerView } from '@in-filtrados/messages';
import { mountEndPanel } from './matchEnd';
import { END_TEXT } from '../constants';

const samplePlayers: PlayerView[] = [
  {
    id: 'p1',
    name: 'Ana',
    color: '#fff',
    x: 0,
    y: 0,
    connected: true,
    alive: true,
    activity: null,
  },
  {
    id: 'p2',
    name: 'Beto',
    color: '#000',
    x: 0,
    y: 0,
    connected: true,
    alive: true,
    activity: null,
  },
];

type FakeElement = {
  textContent: string;
  addEventListener: (event: string, handler: () => void) => void;
};

function createFakeRoot() {
  const elements = new Map<string, FakeElement>();
  const makeEl = (): FakeElement => ({
    textContent: '',
    addEventListener: vi.fn(),
  });
  elements.set('[data-ref="winner"]', makeEl());
  elements.set('[data-ref="impostor"]', makeEl());
  elements.set('[data-ref="coins"]', makeEl());
  elements.set('[data-ref="back"]', makeEl());

  const root = {
    innerHTML: '',
    querySelector: (selector: string) => elements.get(selector) ?? null,
  };
  return { root: root as unknown as HTMLElement, elements };
}

describe('mountEndPanel arrival orders', () => {
  it(
    'updates winner and impostor when matchEnded arrives after snapshot',
    () => {
      const { root, elements } = createFakeRoot();
      const onBack = vi.fn();

      // 1. Snapshot ENDED llega primero: winner e impostores desconocidos
      const panel = mountEndPanel(root, {
        winner: null,
        impostorIds: [],
        players: samplePlayers,
        token: 'tok',
        before: null,
        onBack,
      });

      const winnerEl = elements.get('[data-ref="winner"]')!;
      const impostorEl = elements.get('[data-ref="impostor"]')!;
      const coinsEl = elements.get('[data-ref="coins"]')!;

      expect(winnerEl.textContent).toBe(END_TEXT.ENDED);
      expect(impostorEl.textContent).toBe('');
      // Al no haber perfil previo, avisa revisar en perfil
      expect(coinsEl.textContent).toBe(END_TEXT.COINS_CHECK_PROFILE);

      // 2. matchEnded llega después: actualiza el panel ya montado
      panel.update('crew', ['p2'], samplePlayers);

      expect(winnerEl.textContent).toBe(END_TEXT.CREW_WON);
      expect(impostorEl.textContent).toBe(END_TEXT.IMPOSTOR_WAS('Beto'));

      panel.destroy();
      expect(root.innerHTML).toBe('');
    },
  );

  it(
    'renders winner and impostor directly when matchEnded arrives first',
    () => {
      const { root, elements } = createFakeRoot();
      const onBack = vi.fn();

      // matchEnded llegó antes del snapshot: ya conocemos winner e impostor
      const panel = mountEndPanel(root, {
        winner: 'impostor',
        impostorIds: ['p1'],
        players: samplePlayers,
        token: 'tok',
        before: null,
        onBack,
      });

    const winnerEl = elements.get('[data-ref="winner"]')!;
    const impostorEl = elements.get('[data-ref="impostor"]')!;

    expect(winnerEl.textContent).toBe(END_TEXT.IMPOSTOR_WON);
    expect(impostorEl.textContent).toBe(END_TEXT.IMPOSTOR_WAS('Ana'));

    panel.destroy();
    expect(root.innerHTML).toBe('');
  });
});
