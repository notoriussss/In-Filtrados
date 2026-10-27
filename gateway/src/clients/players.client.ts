import { Injectable } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import * as grpc from '@grpc/grpc-js';
import {
  CHANNEL_OPTIONS,
  loadPackage,
  requireAddr,
  unary,
} from './grpc';
import { createBreaker, guarded } from './resilience';

// Clases (no types) para que Swagger lea el esquema de la respuesta.
export class PlayerReply {
  @ApiProperty() playerId!: string;
  @ApiProperty() username!: string;
}

export class TokenReply {
  @ApiProperty() token!: string;
  @ApiProperty() playerId!: string;
  @ApiProperty() username!: string;
}

export class ProfileReply {
  @ApiProperty() playerId!: string;
  @ApiProperty() username!: string;
  @ApiProperty() coins!: number;
  @ApiProperty() matchesPlayed!: number;
  @ApiProperty() wins!: number;
  // S2-07: estadísticas como impostor.
  @ApiProperty() timesImpostor!: number;
  @ApiProperty() winsAsImpostor!: number;
}

@Injectable()
export class PlayersClient {
  private readonly client: any;
  private readonly breaker = createBreaker('players');

  constructor() {
    const pkg = loadPackage('players.proto');
    this.client = new pkg.players.v1.Players(
      requireAddr('PLAYERS_GRPC_ADDR'),
      grpc.credentials.createInsecure(),
      CHANNEL_OPTIONS,
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
