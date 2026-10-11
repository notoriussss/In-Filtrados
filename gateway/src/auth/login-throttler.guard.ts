import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// S2-08: el límite de login se cuenta por la IP real del cliente
// (`req.ip`). Con `trust proxy` configurado para la subred de Docker
// y loopback, Express solo confía en el encabezado X-Forwarded-For si
// proviene de nginx (web); las conexiones directas a port 3000 usan la
// IP de la conexión socket. No usar req.ips[0]: ahí va la IP cliente.
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.ip;
  }
}
