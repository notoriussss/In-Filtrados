import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// S2-08: el límite de login se cuenta por usuario (`username`),
// con fallback a `req.ip` si el cuerpo no trae nombre válido.
// Contar por usuario independiza el límite de la IP real (que
// Docker Desktop en Windows no suele conservar en la LAN) y
// neutraliza la falsificación con X-Forwarded-For.
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(
    req: Record<string, any>,
  ): Promise<string> {
    const name = req.body?.username;
    return typeof name === 'string' && name.trim() !== ''
      ? `user:${name.trim().toLowerCase()}`
      : `ip:${req.ip}`;
  }
}
