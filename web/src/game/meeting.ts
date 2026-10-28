import type {
  EndReason,
  PlayerView,
  Snapshot,
  Winner,
} from '@in-filtrados/messages';
import { END_TEXT, MEETING_TEXT } from '../constants';
import { RESULT_TEXT } from '../texts';
import { TICK_MS } from '../net/interpolation';

// S2-10: qué muestra el panel de la reunión. Todo sale del snapshot que
// manda match: el navegador no decide nada, solo lo presenta.

export type MeetingPlayer = {
  id: string;
  name: string;
  color: string;
  alive: boolean;
  connected: boolean;
  voted: boolean;
  isMe: boolean;
  votable: boolean; // se puede tocar para votarlo
};

export type MeetingView = {
  stage: 'voting' | 'result';
  reporterText: string;
  tankText: string;
  countdownText: string;
  players: MeetingPlayer[];
  canVote: boolean;
  canChat: boolean;
  hint: string;
  resultTitle: string;
  resultDetail: string;
};

const TICKS_PER_SECOND = 1000 / TICK_MS;

// secondsLeft redondea hacia arriba: "1 s" hasta el último tick.
export function secondsLeft(endsAtTick: number, tick: number): number {
  return Math.max(0, Math.ceil((endsAtTick - tick) / TICKS_PER_SECOND));
}

export function nameOf(players: PlayerView[], id: string): string {
  return players.find((p) => p.id === id)?.name ?? MEETING_TEXT.UNKNOWN_PLAYER;
}

// meetingView arma el panel; null fuera de MEETING.
export function meetingView(snap: Snapshot, meId: string): MeetingView | null {
  const meeting = snap.meeting;
  if (snap.phase !== 'MEETING' || !meeting) return null;

  const me = snap.players.find((p) => p.id === meId);
  const iAmAlive = me?.alive ?? false;
  const voted = new Set(meeting.votesCast);
  const iVoted = voted.has(meId);
  const voting = !meeting.votingClosed;
  const canVote = voting && iAmAlive && !iVoted;

  const emergency = meeting.reason === 'emergency';
  const tank = emergency
    ? undefined
    : snap.tanks.find((t) => t.slot === meeting.tankSlot);
  const tankOwner = tank ? nameOf(snap.players, tank.ownerId) : '';

  const players = snap.players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    alive: p.alive,
    connected: p.connected,
    voted: voted.has(p.id),
    isMe: p.id === meId,
    votable: canVote && p.alive,
  }));

  let hint: string = MEETING_TEXT.CHOOSE_VOTE;
  if (!iAmAlive) hint = MEETING_TEXT.GHOST_CANNOT_VOTE;
  else if (iVoted) hint = MEETING_TEXT.ALREADY_VOTED;

  const seconds = secondsLeft(meeting.endsAtTick, snap.tick);
  const result = resultText(
    meeting.ejectedId,
    meeting.wasImpostor,
    snap.players,
  );

  const reporter = nameOf(snap.players, meeting.reporterId);
  return {
    stage: voting ? 'voting' : 'result',
    reporterText: emergency
      ? MEETING_TEXT.EMERGENCY_BY(reporter)
      : MEETING_TEXT.REPORTED_BY(reporter),
    tankText: tank ? MEETING_TEXT.TANK_OF(tankOwner) : '',
    countdownText: voting
      ? MEETING_TEXT.VOTING_ENDS_IN(seconds)
      : MEETING_TEXT.RESULT_ENDS_IN(seconds),
    players,
    canVote,
    canChat: voting && iAmAlive,
    hint,
    resultTitle: result.title,
    resultDetail: result.detail,
  };
}

// resultText: "Expulsaron a Morado" y "Morado era el impostor".
export function resultText(
  ejectedId: string | null,
  wasImpostor: boolean,
  players: PlayerView[],
): { title: string; detail: string } {
  if (!ejectedId) {
    return { title: MEETING_TEXT.NOBODY_EJECTED, detail: '' };
  }
  const name = nameOf(players, ejectedId);
  return {
    title: MEETING_TEXT.WAS_EJECTED(name),
    detail: wasImpostor
      ? MEETING_TEXT.EJECTED_IMPOSTOR(name)
      : MEETING_TEXT.EJECTED_CREW(name),
  };
}

// endTitle: quién ganó, si match ya mandó matchEnded.
export function endTitle(winner: Winner | null): string {
  if (winner === 'crew') return END_TEXT.CREW_WON;
  if (winner === 'impostor') return END_TEXT.IMPOSTOR_WON;
  return END_TEXT.ENDED;
}

// endSubtitle: motivo específico por el cual terminó la partida (S2-06).
export function endSubtitle(
  winner: Winner | null,
  reason?: EndReason | null,
  impostorCount = 1,
): string {
  if (reason === 'host_left') return RESULT_TEXT.HOST_LEFT_SUB;
  if (!winner) return '';
  if (winner === 'crew') {
    if (reason === 'reservoir_full') {
      return RESULT_TEXT.CREW_RESERVOIR_SUB;
    }
    if (reason === 'impostors_ejected') {
      return impostorCount > 1
        ? RESULT_TEXT.CREW_EJECTED_MULTI_SUB
        : RESULT_TEXT.CREW_EJECTED_SUB;
    }
    return RESULT_TEXT.CREW_SUB;
  }
  if (winner === 'impostor') {
    if (reason === 'tanks_contaminated') {
      return RESULT_TEXT.IMPOSTOR_TANKS_SUB;
    }
    if (reason === 'timeout') {
      return RESULT_TEXT.IMPOSTOR_TIMEOUT_SUB;
    }
    return RESULT_TEXT.IMPOSTOR_SUB;
  }
  return '';
}

// coinsEarned compara el perfil antes y después de la partida; null
// mientras players todavía no procesó match.finished.
export function coinsEarned(
  before: { coins: number; matchesPlayed: number },
  after: { coins: number; matchesPlayed: number },
): number | null {
  if (after.matchesPlayed <= before.matchesPlayed) return null;
  return after.coins - before.coins;
}
