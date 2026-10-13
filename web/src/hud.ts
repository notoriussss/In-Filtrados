// HUD de la partida encima del canvas (S2-09): embalse, botón de acción
// contextual y aviso de "tu tanque se está contaminando".
import type { Action } from './actions';
import { ACTION_TEXT, GAME_RULES, HUD_TEXT } from './constants';

export type Hud = {
  setReservoir: (value: number | null) => void;
  setAction: (action: Action | null) => void;
  showTankAlert: () => void;
  hideTankAlert: () => void;
  destroy: () => void;
};

export function mountHud(onAction: () => void): Hud {
  const reservoir = document.getElementById('reservoir')!;
  const fill = reservoir.querySelector<HTMLElement>('.reservoir-fill')!;
  const reservoirLabel =
    reservoir.querySelector<HTMLElement>('.reservoir-label')!;
  const button =
    document.getElementById('action-button') as HTMLButtonElement;
  const actionLabel = button.querySelector<HTMLElement>('.action-label')!;
  const alert = document.getElementById('tank-alert')!;
  button.querySelector('.action-key')!.textContent = ACTION_TEXT.KEY_HINT;
  alert.textContent = HUD_TEXT.TANK_ALERT;

  const onClick = () => {
    onAction();
    button.blur(); // que la E y las flechas sigan yendo al juego
  };
  button.addEventListener('click', onClick);

  let lastReservoir: number | null = null;
  let lastAction = '';
  let alertTimer: ReturnType<typeof setTimeout> | undefined;

  return {
    setReservoir(value) {
      if (value === lastReservoir) return;
      lastReservoir = value;
      reservoir.hidden = value === null;
      if (value === null) return;
      const pct = Math.round(Math.min(Math.max(value, 0), 100));
      fill.style.width = `${pct}%`;
      reservoirLabel.textContent = HUD_TEXT.reservoir(pct);
    },
    setAction(action) {
      // Solo se toca el DOM cuando cambia lo que se muestra.
      const key = action
        ? `${action.kind}|${action.label}|${action.enabled}`
        : '';
      if (key === lastAction) return;
      lastAction = key;
      button.hidden = action === null;
      if (!action) return;
      actionLabel.textContent = action.label;
      button.disabled = !action.enabled;
      button.className = `action-button ${action.kind}`;
    },
    showTankAlert() {
      alert.hidden = false;
      clearTimeout(alertTimer);
      alertTimer = setTimeout(() => {
        alert.hidden = true;
      }, GAME_RULES.TANK_ALERT_MS);
    },
    hideTankAlert() {
      alert.hidden = true;
      clearTimeout(alertTimer);
    },
    destroy() {
      button.removeEventListener('click', onClick);
      clearTimeout(alertTimer);
      reservoir.hidden = true;
      button.hidden = true;
      alert.hidden = true;
    },
  };
}
