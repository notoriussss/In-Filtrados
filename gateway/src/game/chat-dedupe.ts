import {
  CHAT_IDS_PER_MATCH,
  CHAT_DEDUPE_MATCHES,
} from './game.constants';

// ChatDeduper recuerda los clientMsgId de chat ya reenviados a match en
// cada partida (S3-04). El navegador reintenta al reconectar los
// mensajes escritos sin conexión; si uno ya había pasado, aquí se
// descarta. match descarta también los repetidos, así que este filtro
// en memoria puede olvidar: solo ahorra viajes.
export class ChatDeduper {
  private readonly matches = new Map<string, Set<string>>();

  constructor(
    private readonly perMatch = CHAT_IDS_PER_MATCH,
    private readonly maxMatches = CHAT_DEDUPE_MATCHES,
  ) {}

  // firstTime anota el id y dice si es la primera vez que se ve.
  firstTime(matchId: string, clientMsgId: string): boolean {
    let ids = this.matches.get(matchId);
    if (!ids) {
      ids = new Set();
      this.matches.set(matchId, ids);
      this.forgetOldMatches();
    }
    if (ids.has(clientMsgId)) return false;
    ids.add(clientMsgId);
    if (ids.size > this.perMatch) {
      // Un Set recorre en orden de inserción: se olvida el más viejo.
      ids.delete(ids.values().next().value as string);
    }
    return true;
  }

  private forgetOldMatches(): void {
    while (this.matches.size > this.maxMatches) {
      this.matches.delete(this.matches.keys().next().value as string);
    }
  }
}
