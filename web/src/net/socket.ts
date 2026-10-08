import type { ClientMessage, ServerMessage } from '@in-filtrados/messages';

// S1-07: connects to /ws on the same host (nginx or Vite forward it to the gateway).
// S1-20 adds automatic reconnection.
export function connect(playerId: string, onMessage: (msg: ServerMessage) => void): (msg: ClientMessage) => void {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}/ws?playerId=${encodeURIComponent(playerId)}`);

  ws.addEventListener('open', () => send({ type: 'join', matchId: 'DEV', lastTick: 0 }));
  ws.addEventListener('message', (e) => onMessage(JSON.parse(e.data) as ServerMessage));
  ws.addEventListener('close', (e) => console.warn('WebSocket cerrado', e.code));

  function send(msg: ClientMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }
  return send;
}
