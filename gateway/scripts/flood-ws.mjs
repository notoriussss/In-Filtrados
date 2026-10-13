#!/usr/bin/env node
// S2-08: script de verificación del límite de velocidad. Manda 100
// move en 1 segundo contra /ws y comprueba que el gateway descarta el
// exceso, manda avisos y cierra con el código 4008.
//
// Uso:
//   node gateway/scripts/flood-ws.mjs --token <token> --match <matchId> \
//     [--url ws://localhost:3000/ws] [--count 100] [--ms 1000]
//
// El token sale de POST /api/auth/login y el matchId de POST /api/rooms.
// El limiter cuenta todo frame entrante, así que el script manda el
// join primero igual que el navegador.
//
// Que el otro jugador no nota nada se revisa a mano: entra a la misma
// sala con un segundo navegador (o con el token del segundo jugador
// creado en el mismo match) y observa que sus snapshots siguen llegando
// mientras corre este script contra el primer token.

import WebSocket from 'ws';

const args = parseArgs(process.argv.slice(2));

if (!args.token || !args.match) {
  console.error(
    'Faltan argumentos: --token <token> --match <matchId> ' +
      '[--url <ws://host/ws>] [--count 100] [--ms 1000]',
  );
  process.exit(1);
}

const total = Number(args.count ?? 100);
const windowMs = Number(args.ms ?? 1000);
const url = `${args.url ?? 'ws://localhost:3000/ws'}?token=${encodeURIComponent(
  args.token,
)}`;

let sent = 0;
let closeCode = null;
let sentTimer = null;
const avisos = [];

const ws = new WebSocket(url);

ws.on('open', () => {
  ws.send(
    JSON.stringify({
      type: 'join',
      matchId: args.match,
      lastTick: 0,
    }),
  );
  console.log(`conectado a ${args.url ?? 'ws://localhost:3000/ws'}`);
  console.log(`mandando ${total} move en ${windowMs} ms…`);
  startFlood();
});

ws.on('message', (raw) => {
  let msg;
  try {
    msg = JSON.parse(String(raw));
  } catch {
    return;
  }
  // Los snapshots del otro jugador y los míos no interesan aquí; solo
  // los avisos del límite de velocidad.
  if (msg.type !== 'error') return;
  console.log(`[aviso ${avisos.length + 1}] ${msg.code}: ${msg.message}`);
  avisos.push(msg);
});

ws.on('error', (err) => {
  console.error(`error de conexión: ${err.message}`);
  console.error('¿gateway corriendo? ¿token válido?');
  process.exit(1);
});

ws.on('close', (code) => {
  closeCode = code;
  stopFlood();
  report();
});

function startFlood() {
  const stepMs = windowMs / total;
  sentTimer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      stopFlood();
      return;
    }
    ws.send(JSON.stringify({ type: 'move', dx: 1, dy: 0 }));
    sent += 1;
  }, stepMs);
}

function stopFlood() {
  if (sentTimer !== null) {
    clearInterval(sentTimer);
    sentTimer = null;
  }
}

function report() {
  console.log('---');
  console.log(`move enviados antes del cierre: ${sent}`);
  console.log(`avisos recibidos: ${avisos.length}`);
  console.log(`código de cierre: ${closeCode}`);
  const ok = avisos.length >= 3 && closeCode === 4008;
  if (!ok) {
    console.log('FALLÓ: se esperaban avisos y un cierre con 4008');
    process.exit(1);
  }
  console.log('OK: avisos recibidos y conexión cerrada con 4008');
  process.exit(0);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith('--') || value === undefined) {
      console.error(`argumento inválido: ${key}`);
      process.exit(1);
    }
    out[key.slice(2)] = value;
  }
  return out;
}
