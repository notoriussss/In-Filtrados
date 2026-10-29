import { useCallback, useEffect, useState } from 'react';
import { gameMap } from './map';
import { type SessionData, initialScreen, session } from './session';
import { GameSession } from './game/session';
import type { MapAssets } from './game/render/assets';
import { ERROR_MESSAGES } from './constants';
import { Boot } from './screens/Boot';
import { Access } from './screens/Access';
import { Menu } from './screens/Menu';
import { Join } from './screens/Join';
import { Help } from './screens/Help';
import { Settings } from './screens/Settings';
import { Shop } from './screens/Shop';
import { Ranking } from './screens/Ranking';
import { Lobby } from './screens/Lobby';
import { Game } from './screens/Game';

// Navegación sin router: una pantalla a la vez. La sala de espera y la
// partida comparten la misma GameSession (un solo WebSocket), así que
// empezar la partida no corta la conexión.
type Route =
  | { name: 'boot' }
  | { name: 'access' }
  | { name: 'menu'; error?: string }
  | { name: 'join' }
  | { name: 'help' }
  | { name: 'settings' }
  | { name: 'shop' }
  | { name: 'ranking' }
  | { name: 'lobby' }
  | { name: 'game'; reveal: boolean };

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'boot' });
  const [assets, setAssets] = useState<MapAssets | null>(null);
  const [game, setGame] = useState<GameSession | null>(null);

  const openRoom = useCallback((data: SessionData, a: MapAssets) => {
    const g = new GameSession({
      token: data.token,
      matchId: data.matchId!,
      meId: data.playerId,
      map: gameMap,
      assets: a,
    });
    setGame(g);
    return g;
  }, []);

  // Al terminar la carga: acceso, menú o de vuelta a la sala guardada.
  const onBooted = useCallback(
    (a: MapAssets) => {
      setAssets(a);
      const data = session.loadSession();
      const next = initialScreen(data);
      if (next === 'room' && data) {
        openRoom(data, a);
        setRoute({ name: 'game', reveal: false });
      } else {
        setRoute({ name: next } as Route);
      }
    },
    [openRoom],
  );

  // enterRoom: después de crear o unirse a una sala.
  const enterRoom = useCallback(
    (matchId: string, roomCode: string, isCreator: boolean) => {
      const data = session.loadSession();
      if (!data || !assets) return;
      const next = { ...data, matchId, roomCode, isCreator };
      session.saveSession(next);
      openRoom(next, assets);
      setRoute({ name: 'lobby' });
    },
    [assets, openRoom],
  );

  // leaveRoom: salir de la sala o volver al menú al terminar.
  const leaveRoom = useCallback(
    (error?: string) => {
      // Se avisa antes de cerrar el socket: así match distingue salir a
      // propósito de perder la conexión (que sí se espera).
      game?.leave();
      game?.destroy();
      setGame(null);
      const data = session.loadSession();
      if (data) {
        session.saveSession({
          ...data,
          matchId: '',
          roomCode: undefined,
          isCreator: false,
        });
      }
      setRoute({ name: 'menu', error });
    },
    [game],
  );

  const logout = useCallback(() => {
    game?.destroy();
    setGame(null);
    session.clearSession();
    setRoute({ name: 'access' });
  }, [game]);

  // La sesión del juego avisa si el token venció o la sala ya no existe.
  useEffect(() => {
    if (!game) return;
    return game.subscribe(() => {
      const s = game.getState();
      if (s.unauthorized) logout();
      else if (s.notFound) leaveRoom(ERROR_MESSAGES.MATCH_NOT_FOUND);
    });
  }, [game, logout, leaveRoom]);

  switch (route.name) {
    case 'boot':
      return <Boot onDone={onBooted} />;
    case 'access':
      return <Access onDone={() => setRoute({ name: 'menu' })} />;
    case 'menu':
      return (
        <Menu
          error={route.error}
          onCreated={enterRoom}
          onJoin={() => setRoute({ name: 'join' })}
          onHelp={() => setRoute({ name: 'help' })}
          onShop={() => setRoute({ name: 'shop' })}
          onRanking={() => setRoute({ name: 'ranking' })}
          onSettings={() => setRoute({ name: 'settings' })}
          onLogout={logout}
          onUnauthorized={logout}
        />
      );
    case 'join':
      return (
        <Join onJoined={enterRoom} onBack={() => setRoute({ name: 'menu' })} />
      );
    case 'help':
      return <Help onClose={() => setRoute({ name: 'menu' })} />;
    case 'shop':
      return (
        <Shop
          onClose={() => setRoute({ name: 'menu' })}
          onUnauthorized={logout}
        />
      );
    case 'ranking':
      return (
        <Ranking
          onClose={() => setRoute({ name: 'menu' })}
          onUnauthorized={logout}
        />
      );
    case 'settings':
      return <Settings onClose={() => setRoute({ name: 'menu' })} />;
    case 'lobby':
      return game ? (
        <Lobby
          game={game}
          onLeave={() => leaveRoom()}
          onStarted={() => setRoute({ name: 'game', reveal: true })}
        />
      ) : null;
    case 'game':
      return game ? (
        <Game
          game={game}
          reveal={route.reveal}
          onLobby={() => setRoute({ name: 'lobby' })}
          onLeave={() => leaveRoom()}
        />
      ) : null;
  }
}
