import type { ClientMessage, ServerMessage } from '@in-filtrados/messages';

let currentWs: WebSocket | null = null;

export function connect(
  token: string,
  matchId: string,
  onMessage: (msg: ServerMessage) => void,
): (msg: ClientMessage) => void {
  if (currentWs) {
    currentWs.close();
  }

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const query = encodeURIComponent(token);
  const ws = new WebSocket(`${protocol}://${location.host}/ws?token=${query}`);
  currentWs = ws;

  ws.addEventListener('open', () => {
    send({ type: 'join', matchId, lastTick: 0 });
  });
  ws.addEventListener('message', (e) => {
    onMessage(JSON.parse(e.data) as ServerMessage);
  });
  ws.addEventListener('close', (e) => {
    console.warn('WebSocket cerrado', e.code);
  });

  function send(msg: ClientMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
  return send;
}

export function disconnect(): void {
  if (currentWs) {
    currentWs.close();
    currentWs = null;
  }
}
