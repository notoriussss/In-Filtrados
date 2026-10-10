import { api } from '../api';
import { session } from '../session';
import { MENSAJES_ERROR } from '../constants';

export function mountRegister(
  show: (screen: 'login' | 'register' | 'lobby' | 'game') => void
): void {
  const container = document.getElementById('screen-register')!;
  
  container.innerHTML = `
    <div class="panel">
      <h1>Crear Cuenta</h1>
      <div id="register-error" class="error-msg"></div>
      <form id="register-form">
        <input 
          type="text" 
          id="reg-username" 
          placeholder="Usuario" 
          required 
          autocomplete="username" 
        />
        <input 
          type="password" 
          id="reg-password" 
          placeholder="Contraseña" 
          required 
          autocomplete="new-password" 
        />
        <div class="button-group">
          <button type="submit" id="btn-do-register" class="primary">
            Registrarse
          </button>
          <button type="button" id="btn-back-login" class="secondary">
            Ya tengo cuenta
          </button>
        </div>
      </form>
    </div>
  `;

  const form = document.getElementById('register-form') as HTMLFormElement;
  const usernameInput = document.getElementById('reg-username') as HTMLInputElement;
  const passwordInput = document.getElementById('reg-password') as HTMLInputElement;
  const errorDiv = document.getElementById('register-error') as HTMLDivElement;
  const btnBack = document.getElementById('btn-back-login') as HTMLButtonElement;

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

  btnBack.addEventListener('click', () => {
    show('login');
  });
}
