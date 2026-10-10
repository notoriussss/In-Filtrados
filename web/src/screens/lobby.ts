import { api } from '../api';
import { session } from '../session';
import { ERROR_MESSAGES } from '../constants';
import { connect } from '../net/socket';
import type { ClientMessage, PlayerView } from '@in-filtrados/messages';

export function mountLobby(
  show: (screen: 'login' | 'register' | 'lobby' | 'game') => void
): void {
  const container = document.getElementById('screen-lobby')!;
  const currentSession = session.loadSession();

  if (!currentSession || !currentSession.token) {
    show('login');
    return;
  }

  container.innerHTML = `
    <div class="panel">
      <h2>Sala de espera</h2>
      <div id="lobby-error" class="error-msg"></div>
      
      <div id="lobby-actions">
        <button
          id="btn-create-room"
          class="primary"
          style="margin-bottom: 1rem;"
        >
          Crear sala
        </button>
        
        <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
          <input 
            type="text" 
            id="room-code-input" 
            placeholder="Código de sala" 
            style="margin-bottom: 0;" 
          />
          <button id="btn-join-room" class="secondary">Unirse</button>
        </div>
      </div>

      <div id="lobby-room-info" hidden>
        <p style="margin-bottom: 0.5rem; color: var(--text-muted);">
          Código de la sala
        </p>
        <div id="room-code-display" class="room-code">----</div>
        
        <h3 style="text-align: left; margin-bottom: 0.5rem;">Jugadores</h3>
        <ul id="player-list" class="player-list"></ul>
        
        <button id="btn-start-game" class="primary" hidden disabled>
          Empezar partida
        </button>
      </div>
    </div>
  `;

  const errorDiv = document.getElementById(
    'lobby-error'
  ) as HTMLDivElement;
  const actionsDiv = document.getElementById(
    'lobby-actions'
  ) as HTMLDivElement;
  const roomInfoDiv = document.getElementById(
    'lobby-room-info'
  ) as HTMLDivElement;
  const codeDisplay = document.getElementById(
    'room-code-display'
  ) as HTMLDivElement;
  const playerList = document.getElementById(
    'player-list'
  ) as HTMLUListElement;

  const btnCreate = document.getElementById(
    'btn-create-room'
  ) as HTMLButtonElement;
  const btnJoin = document.getElementById(
    'btn-join-room'
  ) as HTMLButtonElement;
  const codeInput = document.getElementById(
    'room-code-input'
  ) as HTMLInputElement;
  const btnStart = document.getElementById(
    'btn-start-game'
  ) as HTMLButtonElement;

  function showError(msg: string) {
    errorDiv.textContent = msg;
  }

  function clearError() {
    errorDiv.textContent = '';
  }

  let currentSend: ((msg: ClientMessage) => void) | null = null;

  function connectToRoom(token: string, matchId: string) {
    currentSend = connect(token, matchId, (msg) => {
      if (msg.type === 'snapshot') {
        if (msg.phase === 'LOBBY') {
          updatePlayerList(msg.players);
          checkStartCondition(msg.players);
        } else if (msg.phase === 'PLAYING') {
          show('game');
        }
      } else if (msg.type === 'error') {
        if (msg.code === 'UNAUTHORIZED') {
          session.clearSession();
          show('login');
        } else {
          showError(msg.message);
        }
      }
    });
  }

  if (currentSession.matchId) {
    actionsDiv.hidden = true;
    roomInfoDiv.hidden = false;
    codeDisplay.textContent = currentSession.roomCode ?? '...';
    connectToRoom(currentSession.token, currentSession.matchId);
  }

  btnCreate.addEventListener('click', async () => {
    clearError();
    try {
      const res = await api.createRoom(currentSession.token);
      session.saveSession({
        ...currentSession,
        matchId: res.matchId,
        roomCode: res.roomCode,
        isCreator: true,
      });
      actionsDiv.hidden = true;
      roomInfoDiv.hidden = false;
      codeDisplay.textContent = res.roomCode;
      connectToRoom(currentSession.token, res.matchId);
    } catch (err: any) {
      showError(err.message || ERROR_MESSAGES.SERVICE_UNAVAILABLE);
    }
  });

  btnJoin.addEventListener('click', async () => {
    clearError();
    const code = codeInput.value.trim().toUpperCase();
    if (!code) return;

    try {
      const res = await api.joinRoom(currentSession.token, code);
      session.saveSession({
        ...currentSession,
        matchId: res.matchId,
        roomCode: res.roomCode,
        isCreator: false,
      });
      actionsDiv.hidden = true;
      roomInfoDiv.hidden = false;
      codeDisplay.textContent = res.roomCode;
      connectToRoom(currentSession.token, res.matchId);
    } catch (err: any) {
      const msg = err.message || '';
      if (
        msg.includes('404') ||
        msg.toLowerCase().includes('not_found')
      ) {
        showError(ERROR_MESSAGES.ROOM_NOT_FOUND);
      } else {
        showError(msg || ERROR_MESSAGES.SERVICE_UNAVAILABLE);
      }
    }
  });

  function updatePlayerList(players: PlayerView[]) {
    playerList.innerHTML = '';
    for (const p of players) {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="player-color" style="background: ${p.color}"></span>
        <span>${p.name} ${!p.connected ? '(Desconectado)' : ''}</span>
      `;
      playerList.appendChild(li);
    }
  }

  function checkStartCondition(players: PlayerView[]) {
    const isCreator = session.loadSession()?.isCreator ?? false;
    btnStart.hidden = !isCreator;
    const connected = players.filter((p) => p.connected).length;
    btnStart.disabled = connected < 2;
  }

  btnStart.addEventListener('click', () => {
    if (currentSend) {
      currentSend({ type: 'start' });
    }
  });
}
