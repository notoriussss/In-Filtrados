import { skinOf } from '../../shop';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { PlayerView, Snapshot } from '@in-filtrados/messages';
import { Stage } from '../../ui/Stage';
import { Gota } from '../../ui/Gota';
import { meetingView, nameOf, secondsLeft } from '../../game/meeting';
import { MAX_CHAT_LENGTH } from '../../constants';
import { MEETING_UI_TEXT as T } from '../../texts';
import { BACKGROUNDS } from '../backgrounds';
import '../../styles/meeting.css';

// Meeting: interfaz de votación y chat durante la reunión de emergencia.
export function Meeting(props: {
  snap: Snapshot;
  meId: string;
  pendingChat: string[];
  onVote: (targetId: string | null) => void;
  onChat: (text: string) => void;
}) {
  const { snap, meId } = props;
  const view = meetingView(snap, meId)!;
  const m = snap.meeting!;
  const [myVote, setMyVote] = useState<string | null | undefined>(undefined);
  const [text, setText] = useState('');
  const chatEnd = useRef<HTMLDivElement>(null);
  const seconds = secondsLeft(m.endsAtTick, snap.tick);

  const count = view.players.length;
  const cols = count <= 4 ? 2 : count <= 6 ? 3 : count <= 8 ? 4 : 5;
  const portraitScale = count <= 4 ? 5 : count <= 6 ? 4 : 3;

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'end' });
  }, [snap.chat.length, props.pendingChat.length]);

  const vote = (id: string | null) => {
    if (!view.canVote) return;
    setMyVote(id);
    props.onVote(id);
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || !view.canChat) return;
    props.onChat(t);
    setText('');
  };

  const isUrgent = seconds <= 10;
  const formattedSeconds = String(seconds).padStart(2, '0');

  return (
    <div className="overlay-stage solid">
      <Stage className="scr-meeting" background={BACKGROUNDS.mapBlur}>
        <div className="meeting-vignette" />

        <div className="meeting-content">
          <header className="meeting-header">
            <div className="meeting-header-left">
              <div className="meeting-badge-row">
                <span className="meeting-badge-danger">{T.BADGE}</span>
                <span className="meeting-badge-info">{T.GATHERED}</span>
              </div>
              <h1 className="meeting-title">{T.TITLE}</h1>
            </div>

            <div className="meeting-header-right">
              <div className="meeting-phase-pill active">{T.VOTING}</div>
              <div className="meeting-phase-pill muted">{T.RESULT}</div>
              <div className="meeting-timer-pill">
                <span
                  className={`meeting-timer-digits ${
                    isUrgent ? 'urgent' : ''
                  }`}
                >
                  0:{formattedSeconds}
                </span>
              </div>
            </div>
          </header>

          <main className="meeting-grid">
            <section className="meeting-panel-voting">
              <div className="meeting-panel-header">
                <h2 className="meeting-panel-title">{T.CHOOSE}</h2>
                <span className="meeting-reporter-chip">
                  {view.reporterText}
                </span>
              </div>

              <div
                className="meeting-players-grid"
                style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
              >
                {view.players.map((p) => (
                  <MeetingPlayerCard
                    key={p.id}
                    scale={portraitScale}
                    player={snap.players.find((x) => x.id === p.id)!}
                    isMe={p.isMe}
                    voted={p.voted}
                    reporter={p.id === m.reporterId}
                    reporterLabel={
                      m.reason === 'emergency' ? T.CALLER : T.REPORTER
                    }
                    mine={myVote === p.id}
                    votable={p.votable}
                    onVote={() => vote(p.id)}
                  />
                ))}
              </div>

              <div className="meeting-voting-footer">
                <button
                  type="button"
                  className="meeting-skip-btn"
                  disabled={!view.canVote}
                  onClick={() => vote(null)}
                >
                  {T.SKIP}
                  {myVote === null && (
                    <span className="meeting-vote-badge mine">{T.MY_VOTE}</span>
                  )}
                </button>
                <span className="meeting-voting-hint">{view.hint}</span>
              </div>
            </section>

            <section className="meeting-panel-chat">
              <div className="meeting-panel-header">
                <h2 className="meeting-panel-title">{T.CHAT}</h2>
                <span
                  className={`meeting-chat-status ${
                    view.canChat ? 'can-chat' : 'read-only'
                  }`}
                >
                  {view.canChat ? T.CHAT_ALIVE : T.CHAT_GHOST}
                </span>
              </div>

              <div className="meeting-chat-list">
                <div className="meeting-chat-sys-msg">
                  {view.reporterText}
                </div>
                {snap.chat.map((c) => (
                  <MeetingChatLine
                    key={c.id}
                    players={snap.players}
                    playerId={c.playerId}
                    text={c.text}
                  />
                ))}
                {props.pendingChat.map((t, i) => (
                  <MeetingChatLine
                    key={`p${i}`}
                    players={snap.players}
                    playerId={meId}
                    text={t}
                    pending
                  />
                ))}
                <div ref={chatEnd} />
              </div>

              <form className="meeting-chat-form" onSubmit={send}>
                <input
                  className="meeting-chat-input"
                  value={text}
                  maxLength={MAX_CHAT_LENGTH}
                  disabled={!view.canChat}
                  placeholder={
                    view.canChat ? T.PLACEHOLDER : T.GHOST_PLACEHOLDER
                  }
                  onChange={(e) => setText(e.target.value)}
                />
                <button
                  type="submit"
                  className="meeting-chat-send-btn"
                  disabled={!view.canChat}
                >
                  {T.SEND}
                </button>
              </form>
            </section>
          </main>
        </div>
      </Stage>
    </div>
  );
}

function MeetingPlayerCard(props: {
  player: PlayerView;
  scale: number;
  isMe: boolean;
  voted: boolean;
  reporter: boolean;
  reporterLabel: string;
  mine: boolean;
  votable: boolean;
  onVote: () => void;
}) {
  const p = props.player;
  const ghost = !p.alive;

  let statusLabel: string = T.ALIVE;
  let statusTone = 'alive';
  if (ghost) {
    statusLabel = T.GHOST;
    statusTone = 'ghost';
  } else if (!p.connected) {
    statusLabel = T.OFFLINE;
    statusTone = 'offline';
  } else if (props.reporter) {
    statusLabel = props.reporterLabel;
    statusTone = 'reporter';
  }

  return (
    <button
      type="button"
      className={`meeting-player-card ${props.mine ? 'selected-vote' : ''} ${
        ghost ? 'ghost' : ''
      }`}
      disabled={!props.votable}
      onClick={props.onVote}
    >
      {props.mine && (
        <span className="meeting-vote-badge mine">{T.MY_VOTE}</span>
      )}
      {!props.mine && props.voted && (
        <span className="meeting-vote-badge other">{T.VOTED}</span>
      )}

      <div className="meeting-player-portrait">
        <Gota
          color={p.color}
          accessory={p.accessory}
          skin={skinOf(p.skin)}
          scale={props.scale}
          portrait={!ghost}
          ghost={ghost}
        />
      </div>

      <span className="meeting-player-name">
        {props.isMe ? T.you(p.name) : p.name}
      </span>

      <span className={`meeting-status-chip ${statusTone}`}>
        {statusLabel}
      </span>
    </button>
  );
}

function MeetingChatLine(props: {
  players: PlayerView[];
  playerId: string;
  text: string;
  pending?: boolean;
}) {
  const p = props.players.find((x) => x.id === props.playerId);
  const authorName = p?.name ?? nameOf(props.players, props.playerId);

  return (
    <div className={`meeting-chat-msg ${props.pending ? 'pending' : ''}`}>
      <div className="meeting-chat-avatar">
        {p && (
          <Gota
            color={p.color}
            accessory={p.accessory}
            skin={skinOf(p.skin)}
            scale={1.2}
            portrait
          />
        )}
      </div>
      <div className="meeting-chat-bubble">
        <span className="meeting-chat-author">{authorName}</span>
        <span className="meeting-chat-text">
          {props.text}
          {props.pending && (
            <span className="meeting-chat-pending-label">
              · {T.SENDING}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
