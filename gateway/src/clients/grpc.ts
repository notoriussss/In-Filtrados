import * as path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

export const DEADLINE_MS = 2000;

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
