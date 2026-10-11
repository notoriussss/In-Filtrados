import type { ClientMessage, Snapshot } from '@in-filtrados/messages';
import { newClientMsgId } from './ids';

// S3-04: chat sin conexión. Cada mensaje lleva su clientMsgId (UUID) y
// queda en esta cola en memoria hasta verlo en el chat de un snapshot.
// Sin conexión espera; al volver se envía. Si se mandó justo cuando la
// red se cortaba, se reenvía con el mismo id y gateway y match descartan
// el repetido, así que aparece una sola vez para todos.

// match acepta 1 mensaje por segundo por jugador: se deja un margen.
export const CHAT_SEND_GAP_MS = 1100;
// Sin confirmación en este tiempo (con conexión), se reenvía.
export const CHAT_RESEND_MS = 3000;

export type PendingChat = {
  clientMsgId: string;
  text: string;
  sentAt: number | null; // null: todavía no sale (o hay que reenviarlo)
};

export class ChatQueue {
  private pending: PendingChat[] = [];
  private online = false;
  private lastSendAt = -Infinity;

  constructor(
    private readonly send: (msg: ClientMessage) => void,
    private readonly newId: () => string = newClientMsgId,
  ) {}

  // add guarda el mensaje y lo manda en cuanto se pueda.
  add(text: string, now: number): PendingChat {
    const chat = { clientMsgId: this.newId(), text, sentAt: null };
    this.pending.push(chat);
    this.pump(now);
    return chat;
  }

  // offline: se cortó el WebSocket o match no responde. Lo enviado sin
  // confirmar se vuelve a mandar al volver.
  offline(): void {
    this.online = false;
    for (const chat of this.pending) chat.sentAt = null;
  }

  // onSnapshot confirma lo que ya está en el chat y manda lo siguiente.
  // Llegar un snapshot también prueba que se volvió a estar en línea.
  onSnapshot(snap: Snapshot, now: number): void {
    this.online = true;
    if (snap.phase !== 'MEETING') {
      this.pending = []; // fuera de la reunión match ya no los acepta
      return;
    }
    const seen = new Set(snap.chat.map((c) => c.id));
    this.pending = this.pending.filter((c) => !seen.has(c.clientMsgId));
    this.pump(now);
  }

  // waiting: lo que todavía no aparece en el chat (se muestra gris).
  waiting(): readonly PendingChat[] {
    return this.pending;
  }

  private pump(now: number): void {
    if (!this.online || now - this.lastSendAt < CHAT_SEND_GAP_MS) return;
    const next = this.pending.find(
      (c) => c.sentAt === null || now - c.sentAt >= CHAT_RESEND_MS,
    );
    if (!next) return;
    next.sentAt = now;
    this.lastSendAt = now;
    this.send({
      type: 'chat',
      clientMsgId: next.clientMsgId,
      text: next.text,
    });
  }
}
