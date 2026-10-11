import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// S2-08: el límite de login se cuenta por la IP real del cliente
// (`req.ip`). Con `trust proxy 1`, Express toma la última IP de
// X-Forwarded-For, que es la que pone nginx; lo que escriba el
// navegador en ese encabezado no cuenta porque nginx lo reemplaza
// (web/nginx.conf) y el puerto del gateway no se publica fuera de N1.
// No usar req.ips[0]: ahí va la IP que escribe el cliente.
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.ip;
  }
}
