import { api } from '../api';
import { session } from '../session';
import { MENSAJES_ERROR } from '../constants';

export function mountLogin(
  show: (screen: 'login' | 'lobby' | 'game') => void
): void {
  const container = document.getElementById('screen-login')!;
  
  container.innerHTML = `
    <div class="panel">
      <h1>In-Filtrados</h1>
      <div id="login-error" class="error-msg"></div>
      <form id="login-form">
        <input 
          type="text" 
          id="username" 
          placeholder="Usuario" 
          required 
          autocomplete="username" 
        />
        <input 
          type="password" 
          id="password" 
          placeholder="Contraseña" 
          required 
          autocomplete="current-password" 
        />
        <div class="button-group">
          <button type="submit" id="btn-login" class="primary">Entrar</button>
          <button type="button" id="btn-register" class="secondary">
            Crear cuenta
          </button>
        </div>
      </form>
    </div>
  `;

  const form = document.getElementById('login-form') as HTMLFormElement;
  const usernameInput = document.getElementById('username') as HTMLInputElement;
  const passwordInput = document.getElementById('password') as HTMLInputElement;
  const errorDiv = document.getElementById('login-error') as HTMLDivElement;
  const btnRegister = document.getElementById('btn-register') as HTMLButtonElement;

  function showError(msg: string) {
    errorDiv.textContent = msg;
  }

  function clearError() {
    errorDiv.textContent = '';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    try {
      const res = await api.login(username, password);
      session.saveSession({
        token: res.token,
        playerId: res.playerId,
        username: res.username,
      });
      show('lobby');
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('401') || msg.toLowerCase().includes('unauthenticated')) {
        showError(MENSAJES_ERROR.USUARIO_O_CONTRASENA_INCORRECTOS);
      } else {
        showError(msg || MENSAJES_ERROR.SERVICIO_NO_DISPONIBLE);
      }
    }
  });

  btnRegister.addEventListener('click', async () => {
    clearError();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    try {
      await api.register(username, password);
      const res = await api.login(username, password);
      session.saveSession({
        token: res.token,
        playerId: res.playerId,
        username: res.username,
      });
      show('lobby');
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('409') || msg.toLowerCase().includes('already_exists')) {
        showError(MENSAJES_ERROR.USUARIO_YA_EXISTE);
      } else {
        showError(msg || MENSAJES_ERROR.SERVICIO_NO_DISPONIBLE);
      }
    }
  });
}
