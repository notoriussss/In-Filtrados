import { type FormEvent, useState } from 'react';
import { Gota } from '../../ui/Gota';
import { Button } from '../../ui/kit';
import { PENDING_TEXT as T } from '../../texts';

export type RoomChatMessage = {
  id: string;
  author: string;
  color: string; // server color hex of the author
  text: string;
  pending?: boolean;
};

// RoomChat (maqueta 06-lobby): chat of the waiting room. Presentational;
// the parent owns the messages and decides what "send" means.
export function RoomChat(props: {
  messages: RoomChatMessage[];
  maxLength: number;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    props.onSend(clean);
    setText('');
  };
  return (
    <div className="room-chat">
      <div className="well room-chat-log" role="log" aria-live="polite">
        {props.messages.length === 0 && (
          <p className="small muted">{T.CHAT_EMPTY}</p>
        )}
        {props.messages.map((m) => (
          <div className="msg" key={m.id}>
            <Gota color={m.color} scale={1} portrait />
            <div>
              <b>{m.author}</b>
              <span>{m.text}</span>
              {m.pending && <small className="muted"> {T.CHAT_SENDING}</small>}
            </div>
          </div>
        ))}
      </div>
      <form className="row field" onSubmit={submit}>
        <input
          value={text}
          maxLength={props.maxLength}
          placeholder={T.CHAT_PLACEHOLDER}
          aria-label={T.CHAT_PLACEHOLDER}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" variant="pri" small icon="chat">
          {T.CHAT_SEND}
        </Button>
      </form>
    </div>
  );
}
