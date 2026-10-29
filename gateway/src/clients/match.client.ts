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

export type PlayStream = grpc.ClientDuplexStream<unknown, any>;

export class RoomReply {
  @ApiProperty() roomCode!: string;
  @ApiProperty() matchId!: string;
}

@Injectable()
export class MatchClient {
  private readonly client: any;
  private readonly breaker = createBreaker('match');

  constructor() {
    const pkg = loadPackage('match.proto');
    this.client = new pkg.match.v1.Match(
      requireAddr('MATCH_GRPC_ADDR'),
      grpc.credentials.createInsecure(),
      CHANNEL_OPTIONS,
    );
  }

  createRoom(
    playerId: string,
    displayName: string,
  ): Promise<RoomReply> {
    return guarded(this.breaker, () =>
      unary<RoomReply>(this.client, 'CreateRoom', {
        playerId,
        displayName,
      }),
    );
  }

  joinRoom(
    roomCode: string,
    playerId: string,
    displayName: string,
  ): Promise<RoomReply> {
    return guarded(this.breaker, () =>
      unary<RoomReply>(this.client, 'JoinRoom', {
        roomCode,
        playerId,
        displayName,
      }),
    );
  }

  play(): PlayStream {
    return this.client.Play();
  }
}
