import type { PlayerView, Snapshot, Winner } from '@in-filtrados/messages';
import { END_TEXT, MEETING_TEXT } from '../constants';
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

  const tank = snap.tanks.find((t) => t.slot === meeting.tankSlot);
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

  return {
    stage: voting ? 'voting' : 'result',
    reporterText: MEETING_TEXT.REPORTED_BY(
      nameOf(snap.players, meeting.reporterId),
    ),
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

// coinsEarned compara el perfil antes y después de la partida; null
// mientras players todavía no procesó match.finished.
export function coinsEarned(
  before: { coins: number; matchesPlayed: number },
  after: { coins: number; matchesPlayed: number },
): number | null {
  if (after.matchesPlayed <= before.matchesPlayed) return null;
  return after.coins - before.coins;
}
