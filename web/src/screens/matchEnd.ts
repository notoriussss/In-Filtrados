import type { PlayerView, Winner } from '@in-filtrados/messages';
import { api, type MeResponse } from '../api';
import { END_TEXT } from '../constants';
import { coinsEarned, endTitle, nameOf } from '../meeting/view';

// S2-10: pantalla final. Las monedas las calcula players al consumir
// match.finished; aquí solo se compara el perfil de antes y después.

const COINS_POLL_MS = 1000;
const COINS_POLL_ATTEMPTS = 15;

export type EndPanelOptions = {
  winner: Winner | null;
  impostorIds: string[];
  players: PlayerView[];
  token: string;
  // Perfil al entrar a la partida; null si /api/me no respondió.
  before: MeResponse | null;
  onBack: () => void;
};

export function mountEndPanel(
  root: HTMLElement,
  opts: EndPanelOptions,
): () => void {
  root.innerHTML = `
    <div class="panel end-panel">
      <h2>${END_TEXT.TITLE}</h2>
      <p class="end-winner" data-ref="winner"></p>
      <p class="end-impostor" data-ref="impostor"></p>
      <p class="end-coins" data-ref="coins"></p>
      <button class="primary" data-ref="back">
        ${END_TEXT.BACK_TO_LOBBY}
      </button>
    </div>
  `;
  const ref = (name: string) =>
    root.querySelector<HTMLElement>(`[data-ref="${name}"]`)!;
  ref('winner').textContent = endTitle(opts.winner);
  if (opts.impostorIds.length > 0) {
    const names = opts.impostorIds
      .map((id) => nameOf(opts.players, id))
      .join(', ');
    ref('impostor').textContent = END_TEXT.IMPOSTOR_WAS(names);
  }
  const coins = ref('coins');
  coins.textContent = END_TEXT.COINS_PENDING;
  ref('back').addEventListener('click', opts.onBack);

  let stopped = false;
  let attempts = 0;
  let timer = 0;
  const poll = async () => {
    if (stopped || !opts.before) return;
    attempts++;
    try {
      const after = await api.getMe(opts.token);
      const earned = coinsEarned(opts.before, after);
      if (earned !== null) {
        if (!stopped) coins.textContent = END_TEXT.COINS_EARNED(earned);
        return;
      }
    } catch {
      // players caído: se reintenta; las monedas llegan al volver.
    }
    if (attempts < COINS_POLL_ATTEMPTS) {
      timer = window.setTimeout(poll, COINS_POLL_MS);
    }
  };
  void poll();

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    root.innerHTML = '';
  };
}
