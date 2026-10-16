// HUD de la partida encima del canvas (S2-09): embalse, botón de acción
// contextual y aviso de "tu tanque se está contaminando".
import type { EmergencyKind } from '@in-filtrados/messages';
import type { Action } from './actions';
import {
  ACTION_TEXT,
  GAME_RULES,
  HUD_TEXT,
  SABOTAGE_TEXT,
} from './constants';
import type { EmergencyBanner, SabotageButton } from './emergency';

export type Hud = {
  setReservoir: (value: number | null) => void;
  setAction: (action: Action | null) => void;
  showTankAlert: () => void;
  hideTankAlert: () => void;
  // S3-05: aviso de emergencia y menú de sabotaje.
  setEmergency: (banner: EmergencyBanner | null) => void;
  setSabotage: (buttons: SabotageButton[] | null) => void;
  destroy: () => void;
};

export function mountHud(
  onAction: () => void,
  onSabotage: (kind: EmergencyKind) => void = () => {},
): Hud {
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

  const banner = document.getElementById('emergency-banner');
  const sabotage = document.getElementById('sabotage-panel');
  const sabotageButtons = sabotage?.querySelector<HTMLElement>(
    '.sabotage-buttons',
  );
  const sabotageTitle = sabotage?.querySelector('.sabotage-title');
  if (sabotageTitle) sabotageTitle.textContent = SABOTAGE_TEXT.TITLE;
  const onSabotageClick = (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>(
      'button[data-kind]',
    );
    if (!target || target.disabled) return;
    onSabotage(target.dataset.kind as EmergencyKind);
    target.blur();
  };
  sabotageButtons?.addEventListener('click', onSabotageClick);
  let lastBanner = '';
  let lastSabotage = '';

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
    setEmergency(next) {
      if (!banner) return;
      const key = next
        ? `${next.kind}|${next.title}|${next.hint}|${next.time}`
        : '';
      if (key === lastBanner) return;
      lastBanner = key;
      banner.hidden = next === null;
      if (!next) return;
      banner.className = `emergency-banner ${next.kind}`;
      banner.querySelector('.emergency-title')!.textContent = next.title;
      banner.querySelector('.emergency-hint')!.textContent = next.hint;
      const time = banner.querySelector<HTMLElement>('.emergency-time')!;
      time.textContent = next.time ?? '';
      time.hidden = next.time === null;
    },
    setSabotage(buttons) {
      if (!sabotage || !sabotageButtons) return;
      const key = JSON.stringify(buttons);
      if (key === lastSabotage) return;
      lastSabotage = key;
      sabotage.hidden = buttons === null;
      if (!buttons) return;
      sabotageButtons.replaceChildren(
        ...buttons.map((b) => {
          const el = document.createElement('button');
          el.type = 'button';
          el.dataset.kind = b.kind;
          el.className = `sabotage-button ${b.kind}`;
          el.disabled = !b.enabled;
          const label = document.createElement('span');
          label.textContent = b.label;
          const detail = document.createElement('small');
          detail.textContent = b.detail;
          el.append(label, detail);
          return el;
        }),
      );
    },
    destroy() {
      button.removeEventListener('click', onClick);
      sabotageButtons?.removeEventListener('click', onSabotageClick);
      if (banner) banner.hidden = true;
      if (sabotage) sabotage.hidden = true;
      clearTimeout(alertTimer);
      reservoir.hidden = true;
      button.hidden = true;
      alert.hidden = true;
    },
  };
}
