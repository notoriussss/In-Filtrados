import { Injectable } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import { loadPackage, requireAddr, unary } from './grpc';

export type PlayStream = grpc.ClientDuplexStream<unknown, any>;

export type RoomReply = {
  roomCode: string;
  matchId: string;
};

@Injectable()
export class MatchClient {
  private readonly client: any;

  constructor() {
    const pkg = loadPackage('match.proto');
    this.client = new pkg.match.v1.Match(
      requireAddr('MATCH_GRPC_ADDR'),
      grpc.credentials.createInsecure(),
    );
  }

  createRoom(
    playerId: string,
    displayName: string,
  ): Promise<RoomReply> {
    return unary<RoomReply>(this.client, 'CreateRoom', {
      playerId,
      displayName,
    });
  }

  joinRoom(
    roomCode: string,
    playerId: string,
    displayName: string,
  ): Promise<RoomReply> {
    return unary<RoomReply>(this.client, 'JoinRoom', {
      roomCode,
      playerId,
      displayName,
    });
  }

  play(): PlayStream {
    return this.client.Play();
  }
}
