import './style.css';
import { initialScreen, session } from './session';
import { mountLogin } from './screens/login';
import { mountRegister } from './screens/register';
import { mountLobby } from './screens/lobby';
import { mountGame, unmountGame } from './screens/game';

type Screen = 'login' | 'register' | 'lobby' | 'game';
let currentScreen: Screen | null = null;

export function show(screen: Screen, initialError?: string): void {
  if (currentScreen === 'game') unmountGame();

  document.getElementById('screen-login')!.hidden = true;
  document.getElementById('screen-register')!.hidden = true;
  document.getElementById('screen-lobby')!.hidden = true;
  document.getElementById('game')!.hidden = true;

  currentScreen = screen;

  if (screen === 'login') {
    document.getElementById('screen-login')!.hidden = false;
    mountLogin(show);
  } else if (screen === 'register') {
    document.getElementById('screen-register')!.hidden = false;
    mountRegister(show);
  } else if (screen === 'lobby') {
    document.getElementById('screen-lobby')!.hidden = false;
    mountLobby(show, initialError);
  } else if (screen === 'game') {
    document.getElementById('game')!.hidden = false;
    mountGame(show);
  }
}

// Inicialización (S3-01): con una partida guardada vuelve directo a ella
// (recargar a mitad de partida o de reunión); con sesión sin partida va
// al lobby y sin sesión al login. La pantalla de partida regresa al lobby
// si la sala todavía no empezó.
show(initialScreen(session.loadSession()));
