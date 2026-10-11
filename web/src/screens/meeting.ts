import type { ClientMessage, Snapshot } from '@in-filtrados/messages';
import { MEETING_TEXT } from '../constants';
import { type MeetingView, meetingView } from '../meeting/view';
import { newClientMsgId } from '../net/ids';

// S2-10: panel de la reunión sobre el canvas. Se arma una vez y en cada
// snapshot solo se reescriben las partes que cambiaron, para no perder
// lo que el jugador está escribiendo en el chat.

export type MeetingPanel = {
  update(snap: Snapshot): void;
  destroy(): void;
};

export function mountMeetingPanel(
  root: HTMLElement,
  meId: string,
  send: (msg: ClientMessage) => void,
): MeetingPanel {
  root.innerHTML = `
    <div class="meeting-panel">
      <header class="meeting-header">
        <h2>${MEETING_TEXT.TITLE}</h2>
        <div class="meeting-countdown" data-ref="countdown"></div>
      </header>
      <div class="meeting-report">
        <p class="meeting-reporter" data-ref="reporter"></p>
        <p class="meeting-tank" data-ref="tank"></p>
        <p class="meeting-visitors-title">${MEETING_TEXT.LAST_VISITORS}</p>
        <p class="meeting-visitors" data-ref="visitors"></p>
      </div>
      <div class="meeting-body">
        <section class="meeting-vote">
          <h3>${MEETING_TEXT.PLAYERS}</h3>
          <ul class="meeting-players" data-ref="players"></ul>
          <p class="meeting-hint" data-ref="hint"></p>
          <button class="secondary" data-ref="skip">
            ${MEETING_TEXT.SKIP}
          </button>
        </section>
        <section class="meeting-chat">
          <h3>${MEETING_TEXT.CHAT}</h3>
          <ul class="meeting-messages" data-ref="messages"></ul>
          <form class="meeting-chat-form" data-ref="form">
            <input
              data-ref="input"
              maxlength="200"
              autocomplete="off"
            />
            <button class="primary" data-ref="sendBtn">
              ${MEETING_TEXT.SEND}
            </button>
          </form>
        </section>
      </div>
      <div class="meeting-result" data-ref="result" hidden>
        <p class="meeting-result-title" data-ref="resultTitle"></p>
        <p class="meeting-result-detail" data-ref="resultDetail"></p>
        <p class="meeting-hint" data-ref="resultCountdown"></p>
      </div>
    </div>
  `;
  const ref = <T extends HTMLElement>(name: string): T =>
    root.querySelector<T>(`[data-ref="${name}"]`)!;
  const countdown = ref('countdown');
  const reporter = ref('reporter');
  const tank = ref('tank');
  const visitors = ref('visitors');
  const playerList = ref<HTMLUListElement>('players');
  const hint = ref('hint');
  const skip = ref<HTMLButtonElement>('skip');
  const messages = ref<HTMLUListElement>('messages');
  const form = ref<HTMLFormElement>('form');
  const input = ref<HTMLInputElement>('input');
  const sendBtn = ref<HTMLButtonElement>('sendBtn');
  const result = ref('result');
  const resultTitle = ref('resultTitle');
  const resultDetail = ref('resultDetail');
  const resultCountdown = ref('resultCountdown');

  let view: MeetingView | null = null;
  const last = new Map<string, string>();
  // setIfChanged evita tocar el DOM 20 veces por segundo sin necesidad.
  const setIfChanged = (key: string, value: string, apply: () => void) => {
    if (last.get(key) === value) return;
    last.set(key, value);
    apply();
  };

  // Un clic en un jugador vota por él; el servidor rechaza a los
  // fantasmas y los votos repetidos aunque se fuercen desde la consola.
  playerList.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-player-id]',
    );
    if (!item || !view?.canVote) return;
    const id = item.dataset.playerId!;
    if (!view.players.find((p) => p.id === id)?.votable) return;
    send({ type: 'vote', targetPlayerId: id });
  });
  skip.addEventListener('click', () => {
    if (view?.canVote) send({ type: 'vote', targetPlayerId: null });
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !view?.canChat) return;
    send({ type: 'chat', clientMsgId: newClientMsgId(), text });
    input.value = '';
  });

  function update(snap: Snapshot): void {
    view = meetingView(snap, meId);
    if (!view) return;
    const v = view;

    setIfChanged('countdown', v.countdownText, () => {
      countdown.textContent = v.countdownText;
      resultCountdown.textContent = v.countdownText;
    });
    setIfChanged('reporter', v.reporterText, () => {
      reporter.textContent = v.reporterText;
    });
    setIfChanged('tank', v.tankText, () => {
      tank.textContent = v.tankText;
    });
    const visitorText = v.lastVisitors.length
      ? v.lastVisitors.join(', ')
      : MEETING_TEXT.NO_VISITORS;
    setIfChanged('visitors', visitorText, () => {
      visitors.textContent = visitorText;
    });
    setIfChanged('hint', v.hint, () => {
      hint.textContent = v.hint;
    });
    skip.disabled = !v.canVote;

    const playersKey = JSON.stringify(v.players);
    setIfChanged('players', playersKey, () => {
      playerList.replaceChildren(...v.players.map(playerItem));
    });

    const chatKey = JSON.stringify(snap.chat.map((c) => c.id));
    setIfChanged('chat', chatKey, () => {
      messages.replaceChildren(
        ...snap.chat.map((c) => {
          const li = document.createElement('li');
          const who = document.createElement('strong');
          const player = snap.players.find((p) => p.id === c.playerId);
          who.textContent = `${player?.name ?? MEETING_TEXT.UNKNOWN_PLAYER}: `;
          who.style.color = player?.color ?? '';
          li.append(who, document.createTextNode(c.text));
          return li;
        }),
      );
      messages.scrollTop = messages.scrollHeight;
    });

    const chatState = v.canChat ? 'on' : 'off';
    setIfChanged('chatState', chatState, () => {
      input.disabled = !v.canChat;
      sendBtn.disabled = !v.canChat;
      input.placeholder = v.canChat
        ? MEETING_TEXT.CHAT_PLACEHOLDER
        : MEETING_TEXT.GHOST_CHAT_PLACEHOLDER;
    });

    setIfChanged('stage', v.stage + v.resultTitle, () => {
      result.hidden = v.stage !== 'result';
      resultTitle.textContent = v.resultTitle;
      resultDetail.textContent = v.resultDetail;
    });
  }

  return {
    update,
    destroy: () => {
      root.innerHTML = '';
    },
  };
}

// playerItem: un jugador con su color, sus estados y si ya votó.
function playerItem(p: MeetingView['players'][number]): HTMLLIElement {
  const li = document.createElement('li');
  li.dataset.playerId = p.id;
  li.className = 'meeting-player';
  if (p.votable) li.classList.add('votable');
  if (!p.alive) li.classList.add('ghost');

  const dot = document.createElement('span');
  dot.className = 'player-color';
  dot.style.background = p.color;

  const name = document.createElement('span');
  name.className = 'meeting-player-name';
  name.textContent = p.isMe ? `${p.name} (${MEETING_TEXT.YOU})` : p.name;

  const tags = document.createElement('span');
  tags.className = 'meeting-player-tags';
  const labels: string[] = [];
  if (!p.alive) labels.push(MEETING_TEXT.GHOST);
  if (!p.connected) labels.push(MEETING_TEXT.DISCONNECTED);
  tags.textContent = labels.join(' · ');

  const voted = document.createElement('span');
  voted.className = 'meeting-voted';
  voted.textContent = p.voted ? `✓ ${MEETING_TEXT.VOTED}` : '';

  li.append(dot, name, tags, voted);
  return li;
}
