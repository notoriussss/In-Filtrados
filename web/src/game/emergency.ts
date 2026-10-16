// S3-05: lo que muestra el HUD de una emergencia y del menú de sabotaje.
// Solo arma textos y estados a partir del snapshot: match decide todo.
import type { EmergencyKind, Snapshot } from '@in-filtrados/messages';
import type { GameMap } from '../map';
import { EMERGENCY_TEXT, GAME_RULES, SABOTAGE_TEXT } from '../constants';

export type EmergencyBanner = {
  kind: EmergencyKind;
  title: string;
  hint: string;
  time: string | null; // cuenta regresiva de la tubería
};

// emergencyBanner: el aviso para todos (el mismo si fue sabotaje o mala
// suerte). null si no hay emergencia o la partida no está en juego.
export function emergencyBanner(
  snap: Snapshot | null,
  map: GameMap,
  tick: number,
): EmergencyBanner | null {
  const e = snap?.emergency;
  if (!snap || !e || snap.phase !== 'PLAYING') return null;
  if (e.kind === 'pipe') {
    const total = map.fixPoints.filter((fp) => fp.kind === 'pipe').length;
    const left = Math.max(
      Math.ceil((e.endsAtTick - tick) / GAME_RULES.TICKS_PER_SECOND),
      0,
    );
    return {
      kind: 'pipe',
      title: EMERGENCY_TEXT.PIPE_TITLE,
      hint: EMERGENCY_TEXT.pipeHint(e.heldPoints.length, total),
      time: EMERGENCY_TEXT.pipeTime(left),
    };
  }
  return {
    kind: 'steam',
    title: EMERGENCY_TEXT.STEAM_TITLE,
    hint: EMERGENCY_TEXT.STEAM_HINT,
    time: null,
  };
}

export type SabotageButton = {
  kind: EmergencyKind;
  label: string;
  detail: string;
  enabled: boolean;
};

// sabotageButtons: el menú del impostor; null para los tripulantes o
// fuera de PLAYING. Los botones se apagan durante la espera, con otra
// emergencia activa o si la tubería ya se rompió 2 veces.
export function sabotageButtons(
  snap: Snapshot | null,
  tick: number,
): SabotageButton[] | null {
  const status = snap?.mySabotage;
  if (!snap || !status || snap.phase !== 'PLAYING') return null;
  if (snap.myRole !== 'IMPOSTOR') return null;
  const wait = Math.ceil(
    (status.readyAtTick - tick) / GAME_RULES.TICKS_PER_SECOND,
  );
  const busy = snap.emergency !== null;
  const common = (ok: boolean, idle: string) => {
    if (busy) return { enabled: false, detail: SABOTAGE_TEXT.ACTIVE };
    if (wait > 0) return { enabled: false, detail: SABOTAGE_TEXT.wait(wait) };
    return { enabled: ok, detail: idle };
  };
  const pipe =
    status.pipesLeft > 0
      ? common(true, SABOTAGE_TEXT.pipesLeft(status.pipesLeft))
      : { enabled: false, detail: SABOTAGE_TEXT.NO_PIPES };
  return [
    { kind: 'pipe', label: SABOTAGE_TEXT.PIPE, ...pipe },
    { kind: 'steam', label: SABOTAGE_TEXT.STEAM, ...common(true, '') },
  ];
}
