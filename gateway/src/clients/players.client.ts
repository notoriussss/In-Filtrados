import * as path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const PROTO_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'proto',
  'players.proto',
);

const definition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false, // Convierte snake_case a camelCase (player_id -> playerId)
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
});

const loaded = grpc.loadPackageDefinition(definition) as any;

export interface ValidateTokenResponse {
  playerId: string;
  username: string;
}

let client: any = null;

function getClient() {
  if (!client) {
    const addr = process.env.PLAYERS_GRPC_ADDR;
    if (!addr) {
      throw new Error('PLAYERS_GRPC_ADDR is not set');
    }
    client = new loaded.players.v1.Players(
      addr,
      grpc.credentials.createInsecure(),
    );
  }
  return client;
}

export function validateToken(token: string): Promise<ValidateTokenResponse> {
  return new Promise((resolve, reject) => {
    getClient().ValidateToken({ token }, (err: grpc.ServiceError, response: ValidateTokenResponse) => {
      if (err) {
        reject(err);
      } else {
        resolve(response);
      }
    });
  });
}
