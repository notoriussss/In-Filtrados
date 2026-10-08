import * as path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

// Loads proto/match.proto at startup; nothing is generated (docs/tasks.md S1-02).
// From src/ (ts-node) and from dist/ (Docker) the proto folder is two levels up.
const PROTO_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'proto',
  'match.proto',
);

const definition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false, // player_id -> playerId
  longs: Number, // tick arrives as a number
  enums: String, // phase arrives as 'LOBBY', 'PLAYING'...
  defaults: true, // connected: false is sent too
  oneofs: true,
});
const loaded = grpc.loadPackageDefinition(definition) as any;

export type PlayStream = grpc.ClientDuplexStream<unknown, any>;

export function createMatchClient(): { play(): PlayStream } {
  const addr = process.env.MATCH_GRPC_ADDR;
  if (!addr) {
    throw new Error('MATCH_GRPC_ADDR is not set');
  }
  return new loaded.match.v1.Match(
    addr,
    grpc.credentials.createInsecure(),
  );
}
