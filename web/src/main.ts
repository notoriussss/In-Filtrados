import './style.css';
import { session } from './session';
import { mountLogin } from './screens/login';
import { mountLobby } from './screens/lobby';
import { mountGame, unmountGame } from './screens/game';

type Screen = 'login' | 'lobby' | 'game';
let currentScreen: Screen | null = null;

export function show(screen: Screen): void {
  if (currentScreen === 'game') unmountGame();

  document.getElementById('screen-login')!.hidden = true;
  document.getElementById('screen-lobby')!.hidden = true;
  document.getElementById('game')!.hidden = true;

  currentScreen = screen;

  if (screen === 'login') {
    document.getElementById('screen-login')!.hidden = false;
    mountLogin(show);
  } else if (screen === 'lobby') {
    document.getElementById('screen-lobby')!.hidden = false;
    mountLobby(show);
  } else if (screen === 'game') {
    document.getElementById('game')!.hidden = false;
    mountGame(show);
  }
}

// Inicialización: si hay sesión guardada, va al lobby, si no, al login.
const currentSession = session.loadSession();
if (currentSession && currentSession.token) {
  show('lobby');
} else {
  show('login');
}
