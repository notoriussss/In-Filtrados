import {
  CHAT_IDS_PER_MATCH,
  CHAT_DEDUPE_MATCHES,
  CHAT_IN_FLIGHT_MS,
} from './game.constants';

// ChatDeduper recuerda los clientMsgId de chat ya reenviados a match en
// cada partida (S3-04). Solo descarta duplicados en vuelo (inFlightMs);
// si match descartó un chat por pausa o espera, el reintento posterior
// del cliente volverá a pasar. match tiene seenChat como autoridad.
export class ChatDeduper {
  private readonly matches = new Map<string, Map<string, number>>();

  constructor(
    private readonly perMatch = CHAT_IDS_PER_MATCH,
    private readonly maxMatches = CHAT_DEDUPE_MATCHES,
    private readonly inFlightMs = CHAT_IN_FLIGHT_MS,
  ) {}

  // firstTime anota el id y dice si es la primera vez que se ve dentro
  // de la ventana en vuelo.
  firstTime(
    matchId: string,
    clientMsgId: string,
    now: number = Date.now(),
  ): boolean {
    let ids = this.matches.get(matchId);
    if (!ids) {
      ids = new Map<string, number>();
      this.matches.set(matchId, ids);
      this.forgetOldMatches();
    }
    const lastSeen = ids.get(clientMsgId);
    if (lastSeen !== undefined && now - lastSeen < this.inFlightMs) {
      return false;
    }
    ids.set(clientMsgId, now);
    if (ids.size > this.perMatch) {
      ids.delete(ids.keys().next().value as string);
    }
    return true;
  }

  private forgetOldMatches(): void {
    while (this.matches.size > this.maxMatches) {
      this.matches.delete(this.matches.keys().next().value as string);
    }
  }
}
