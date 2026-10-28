import * as path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

export const DEADLINE_MS = 2000;

// Opciones de los canales gRPC (deployment-lab.md, 9.1). El keepalive
// detecta en ~5 s una conexión que quedó abierta a medias (cable
// quitado) y el backoff corto encuentra rápido a un servicio que volvió;
// el de grpc-js por defecto crece hasta 120 s.
export const CHANNEL_OPTIONS: grpc.ChannelOptions = {
  'grpc.keepalive_time_ms': 2000,
  'grpc.keepalive_timeout_ms': 3000,
  'grpc.keepalive_permit_without_calls': 1,
  'grpc.initial_reconnect_backoff_ms': 500,
  'grpc.max_reconnect_backoff_ms': 5000,
};

export function loadPackage(file: string): any {
  const protoPath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'proto',
    file,
  );
  const definition = protoLoader.loadSync(protoPath, {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(definition);
}

export function requireAddr(envVar: string): string {
  const addr = process.env[envVar];
  if (!addr) {
    throw new Error(`${envVar} is not set`);
  }
  return addr;
}

export function unary<Res>(
  client: any,
  method: string,
  request: object,
): Promise<Res> {
  const deadline = new Date(Date.now() + DEADLINE_MS);
  return new Promise((resolve, reject) => {
    client[method](
      request,
      { deadline },
      (err: grpc.ServiceError | null, res: Res) =>
        err ? reject(err) : resolve(res),
    );
  });
}
