import { useEffect, useRef, useState } from 'react';
import { HudLayer } from '../ui/Stage';
import { api, type MeResponse } from '../api';
import { session } from '../session';
import type { GameSession } from '../game/session';
import { useGame } from './game/useGame';
import { Hud } from './game/Hud';
import { RoleReveal } from './game/RoleReveal';
import { Meeting } from './game/Meeting';
import { Ejection } from './game/Ejection';
import { Result } from './game/Result';
import { PauseMenu } from './game/PauseMenu';
import { ConnectionPanel } from './game/ConnectionPanel';
import { Minigame } from './game/Minigame';
import { Help } from './Help';
import { Settings } from './Settings';

// Game: el canvas del mundo (lo dibuja GameSession) y, encima, la
// interfaz de React: HUD, minijuego, reunión, expulsión, resultado,
// pausa y avisos de conexión.
export function Game(props: {
  game: GameSession;
  reveal: boolean; // mostrar el rol (se entró desde la sala de espera)
  onLobby: () => void;
  onLeave: () => void;
}) {
  const { game } = props;
  const state = useGame(game);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [revealing, setRevealing] = useState(props.reveal);
  const [paused, setPaused] = useState(false);
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const [before, setBefore] = useState<MeResponse | null>(null);
  const snap = state.snapshot;
  const phase = snap?.phase;

  useEffect(() => {
    if (canvas.current) game.attach(canvas.current);
  }, [game]);

  // Perfil al entrar: el resultado compara las monedas con este.
  useEffect(() => {
    const data = session.loadSession();
    if (data) api.getMe(data.token).then(setBefore, () => setBefore(null));
  }, []);

  // Recargar con la sala todavía en espera vuelve a la sala de espera.
  useEffect(() => {
    if (phase === 'LOBBY') props.onLobby();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(
    () => game.setPaused(paused || help || settings),
    [game, paused, help, settings],
  );

  // Esc abre o cierra la pausa (si no hay minijuego, que Esc cierra).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || help || settings) return;
      if (game.getState().minigame) return;
      if (game.getState().snapshot?.phase !== 'PLAYING') return;
      setPaused((p) => !p);
    };
    // En captura: corre antes que el Esc del minijuego.
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [game, help, settings]);

  const meeting = phase === 'MEETING' && snap?.meeting ? snap.meeting : null;
  return (
    <>
      <canvas ref={canvas} className="game-canvas" />
      <HudLayer>
        <Hud game={game} state={state} />
        {state.minigame && phase === 'PLAYING' && (
          <Minigame
            key={state.minigame.stationId}
            type={state.minigame.type}
            stationId={state.minigame.stationId}
            color={snap?.players.find((p) => p.id === game.meId)?.color}
            onComplete={state.minigame.onComplete}
            onClose={state.minigame.onClose}
          />
        )}
        <ConnectionPanel status={state.status} matchDown={state.matchDown} />
      </HudLayer>
      {meeting && !meeting.votingClosed && snap && (
        <Meeting
          snap={snap}
          meId={game.meId}
          pendingChat={state.pendingChat}
          onVote={game.vote}
          onChat={game.chat}
        />
      )}
      {meeting && meeting.votingClosed && snap && <Ejection snap={snap} />}
      {phase === 'ENDED' && snap && (
        <Result
          snap={snap}
          meId={game.meId}
          winner={state.winner}
          impostorIds={state.impostorIds}
          before={before}
          onExit={props.onLeave}
        />
      )}
      {revealing && phase === 'PLAYING' && snap && (
        <RoleReveal
          snap={snap}
          meId={game.meId}
          onDone={() => setRevealing(false)}
        />
      )}
      {paused && !help && !settings && phase === 'PLAYING' && (
        <PauseMenu
          onResume={() => setPaused(false)}
          onHelp={() => setHelp(true)}
          onSettings={() => setSettings(true)}
          onLeave={props.onLeave}
        />
      )}
      {help && (
        <div className="overlay-stage solid">
          <Help overlay onClose={() => setHelp(false)} />
        </div>
      )}
      {settings && (
        <div className="overlay-stage solid">
          <Settings overlay onClose={() => setSettings(false)} />
        </div>
      )}
    </>
  );
}
