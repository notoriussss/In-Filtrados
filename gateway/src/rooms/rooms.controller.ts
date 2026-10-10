import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MatchClient, RoomReply } from '../clients/match.client';
import { toHttpException } from '../clients/grpc-errors';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard';

@Controller('api/rooms')
@UseGuards(AuthGuard)
export class RoomsController {
  constructor(private readonly match: MatchClient) {}

  @Post()
  async createRoom(
    @Req() req: AuthedRequest,
  ): Promise<RoomReply> {
    try {
      return await this.match.createRoom(
        req.player.playerId,
        req.player.username,
      );
    } catch (err) {
      throw toHttpException(err);
    }
  }

  @Post(':roomCode/join')
  @HttpCode(HttpStatus.OK)
  async joinRoom(
    @Param('roomCode') roomCode: string,
    @Req() req: AuthedRequest,
  ): Promise<RoomReply> {
    try {
      return await this.match.joinRoom(
        roomCode.toUpperCase(),
        req.player.playerId,
        req.player.username,
      );
    } catch (err) {
      throw toHttpException(err);
    }
  }
}
