import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PlayersClient, PlayerReply } from '../clients/players.client';
import { toHttpException } from '../clients/grpc-errors';
import { AUTH_CONSTANTS, HTTP_MESSAGES } from '../http.constants';

export type AuthedRequest = Request & {
  player: PlayerReply;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly players: PlayersClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;

    if (!header || !header.startsWith(AUTH_CONSTANTS.BEARER_PREFIX)) {
      throw new UnauthorizedException(HTTP_MESSAGES.MISSING_TOKEN);
    }

    const token = header
      .slice(AUTH_CONSTANTS.BEARER_PREFIX.length)
      .trim();
    if (!token) {
      throw new UnauthorizedException(HTTP_MESSAGES.MISSING_TOKEN);
    }

    try {
      const player = await this.players.validateToken(token);
      req.player = player;
      return true;
    } catch (err) {
      throw toHttpException(err);
    }
  }
}
