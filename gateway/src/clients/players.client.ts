import { Injectable } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import * as grpc from '@grpc/grpc-js';
import { loadPackage, requireAddr, unary } from './grpc';
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

export class ShopItemReply {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['character', 'accessory'] }) kind!: string;
  @ApiProperty() price!: number;
  @ApiProperty() owned!: boolean;
}

export class ShopReply {
  @ApiProperty() coins!: number;
  @ApiProperty({ type: [ShopItemReply] }) items!: ShopItemReply[];
}

export class RankingEntryReply {
  @ApiProperty() playerId!: string;
  @ApiProperty() username!: string;
  @ApiProperty() matchesPlayed!: number;
  @ApiProperty() wins!: number;
  @ApiProperty() timesImpostor!: number;
  @ApiProperty() winsAsImpostor!: number;
  @ApiProperty() harvest!: number;
  @ApiProperty() coinsEarned!: number;
  @ApiProperty() litersSaved!: number;
}

export class RankingReply {
  @ApiProperty({ type: [RankingEntryReply] }) entries!: RankingEntryReply[];
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

  getShop(playerId: string): Promise<ShopReply> {
    return guarded(this.breaker, () =>
      unary<ShopReply>(this.client, 'GetShop', { playerId }),
    );
  }

  // Comprar no se reintenta sola: si la respuesta se pierde, volver a
  // intentar podría cobrar dos veces (players igual lo rechaza con
  // ALREADY_EXISTS, pero el jugador vería un error de más).
  buyItem(playerId: string, itemId: string): Promise<ShopReply> {
    return guarded(
      this.breaker,
      () => unary<ShopReply>(this.client, 'BuyItem', { playerId, itemId }),
      false,
    );
  }

  getRanking(limit = 0): Promise<RankingReply> {
    return guarded(this.breaker, () =>
      unary<RankingReply>(this.client, 'GetRanking', { limit }),
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
