import { skinOf } from '../../shop';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { PlayerView, Snapshot } from '@in-filtrados/messages';
import { Stage } from '../../ui/Stage';
import { Gota } from '../../ui/Gota';
import { Icon } from '../../ui/Icon';
import { Button, Chip, Pill, TitleBar } from '../../ui/kit';
import { meetingView, nameOf, secondsLeft } from '../../game/meeting';
import { MAX_CHAT_LENGTH } from '../../constants';
import { MEETING_UI_TEXT as T } from '../../texts';
import { BACKGROUNDS } from '../backgrounds';

// Meeting (maqueta 14-reunion, fase de votación): tarjetas para votar,
// el chat y el chat. Todo sale del
// snapshot (meetingView); el servidor rechaza los votos que no valen.
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
  // Pocas tarjetas se agrandan para llenar el panel; con más, caben más
  // por fila (hasta 10 jugadores en 2 filas).
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

  return (
    <div className="overlay-stage solid">
      <Stage className="scr-meeting" background={BACKGROUNDS.mapBlur}>
        <div className="shade dim" />
        <div className="shade warm" />
        <div
          className="row"
          style={{
            position: 'absolute',
            left: 60,
            right: 60,
            top: 24,
            height: 110,
            justifyContent: 'space-between',
          }}
        >
          <div className="col" style={{ gap: 6 }}>
            <div className="row" style={{ gap: 12 }}>
              <Chip tone="bad" big icon="warning">
                {T.BADGE}
              </Chip>
              <Chip tone="warn" icon="map">
                {T.GATHERED}
              </Chip>
            </div>
            <span className="h2 screen-title" style={{ fontSize: 56 }}>
              {T.TITLE}
            </span>
          </div>
          <div className="row" style={{ gap: 14 }}>
            <div className="phase">
              <Chip big tone="info" icon="check">
                {T.VOTING}
              </Chip>
              <Chip big>{T.RESULT}</Chip>
            </div>
            <Pill icon="clock" style={{ fontSize: 40 }}>
              <span className="num">0:{String(seconds).padStart(2, '0')}</span>
            </Pill>
          </div>
        </div>

        <section
          className="panel col-panel"
          style={{
            left: 60,
            top: 150,
            width: 1180,
            height: 896,
            padding: '22px 26px',
          }}
        >
          <TitleBar icon="user" title={T.CHOOSE} size={32}>
            <Chip tone="warn">{view.reporterText}</Chip>
          </TitleBar>
          <div
            className="pcs"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
          >
            {view.players.map((p) => (
              <PlayerCard
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
          <div
            className="row"
            style={{ marginTop: 14, justifyContent: 'space-between' }}
          >
            <Button
              variant="sec"
              small
              icon="cross"
              disabled={!view.canVote}
              onClick={() => vote(null)}
            >
              {T.SKIP}
              {myVote === null && <Chip className="ml">{T.MY_VOTE}</Chip>}
            </Button>
            <span className="small muted">{view.hint}</span>
          </div>
        </section>

        <section
          className="panel col-panel"
          style={{
            left: 1260,
            top: 150,
            width: 600,
            height: 896,
            padding: '22px 26px',
          }}
        >
          <TitleBar icon="chat" title={T.CHAT} size={32}>
            <Chip tone={view.canChat ? 'ok' : ''}>
              {view.canChat ? T.CHAT_ALIVE : T.CHAT_GHOST}
            </Chip>
          </TitleBar>
          <div className="well chat-log">
            <div className="msg sys">
              <span>{view.reporterText}</span>
            </div>
            {snap.chat.map((c) => (
              <ChatLine
                key={c.id}
                players={snap.players}
                playerId={c.playerId}
                text={c.text}
              />
            ))}
            {props.pendingChat.map((t, i) => (
              <ChatLine
                key={`p${i}`}
                players={snap.players}
                playerId={meId}
                text={t}
                pending
              />
            ))}
            <div ref={chatEnd} />
          </div>
          <form
            className="row"
            style={{ marginTop: 12, gap: 12 }}
            onSubmit={send}
          >
            <div className="field grow">
              <input
                value={text}
                maxLength={MAX_CHAT_LENGTH}
                disabled={!view.canChat}
                placeholder={view.canChat ? T.PLACEHOLDER : T.GHOST_PLACEHOLDER}
                onChange={(e) => setText(e.target.value)}
                style={{ height: 56, fontSize: '.9em' }}
              />
            </div>
            <Button type="submit" icon="right" disabled={!view.canChat}>
              {T.SEND}
            </Button>
          </form>
        </section>
      </Stage>
    </div>
  );
}

function PlayerCard(props: {
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
  let chip = <Chip tone="ok">{T.ALIVE}</Chip>;
  if (ghost) chip = <Chip tone="warn">{T.GHOST}</Chip>;
  else if (!p.connected) chip = <Chip tone="bad">{T.OFFLINE}</Chip>;
  else if (props.reporter) {
    chip = <Chip tone="info">{props.reporterLabel}</Chip>;
  }
  return (
    <button
      className={`card pc ${props.mine ? 'on' : ''} ${ghost ? 'ghostc' : ''}`}
      disabled={!props.votable}
      onClick={props.onVote}
    >
      <div className="pic">
        <Gota
          color={p.color}
          accessory={p.accessory}
          skin={skinOf(p.skin)}
          scale={props.scale}
          portrait={!ghost}
          ghost={ghost}
        />
      </div>
      <b className="pn">{props.isMe ? T.you(p.name) : p.name}</b>
      {chip}
      {(props.mine || props.voted) && (
        <span className="mark">
          <Icon name="check" palette="leaf" size={18} />
          {props.mine ? T.MY_VOTE : T.VOTED}
        </span>
      )}
    </button>
  );
}

function ChatLine(props: {
  players: PlayerView[];
  playerId: string;
  text: string;
  pending?: boolean;
}) {
  const p = props.players.find((x) => x.id === props.playerId);
  return (
    <div className={`msg ${props.pending ? 'pending' : ''}`}>
      <span>
        {p && (
          <Gota
            color={p.color}
            accessory={p.accessory}
            skin={skinOf(p.skin)}
            scale={1}
            portrait
          />
        )}
      </span>
      <span>
        <b>{p?.name ?? nameOf(props.players, props.playerId)}</b>
        {props.text}
        {props.pending && <i className="muted"> · {T.SENDING}</i>}
      </span>
    </div>
  );
}
