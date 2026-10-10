import { Injectable } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import { loadPackage, requireAddr, unary } from './grpc';
import { createBreaker, guarded } from './resilience';

export type PlayerReply = {
  playerId: string;
  username: string;
};

export type TokenReply = {
  token: string;
  playerId: string;
  username: string;
};

export type ProfileReply = {
  playerId: string;
  username: string;
  coins: number;
  matchesPlayed: number;
  wins: number;
};

@Injectable()
export class PlayersClient {
  private readonly client: any;
  private readonly breaker = createBreaker('players');

  constructor() {
    const pkg = loadPackage('players.proto');
    this.client = new pkg.players.v1.Players(
      requireAddr('PLAYERS_GRPC_ADDR'),
      grpc.credentials.createInsecure(),
    );
  }

  register(
    username: string,
    password: string,
  ): Promise<PlayerReply> {
    return guarded(
      this.breaker,
      () =>
        unary<PlayerReply>(this.client, 'Register', {
          username,
          password,
        }),
      false,
    );
  }

  login(
    username: string,
    password: string,
  ): Promise<TokenReply> {
    return guarded(this.breaker, () =>
      unary<TokenReply>(this.client, 'Login', {
        username,
        password,
      }),
    );
  }

  validateToken(token: string): Promise<PlayerReply> {
    return guarded(this.breaker, () =>
      unary<PlayerReply>(this.client, 'ValidateToken', {
        token,
      }),
    );
  }

  getProfile(playerId: string): Promise<ProfileReply> {
    return guarded(this.breaker, () =>
      unary<ProfileReply>(this.client, 'GetProfile', {
        playerId,
      }),
    );
  }
}
