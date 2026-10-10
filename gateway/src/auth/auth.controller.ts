import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  PlayersClient,
  PlayerReply,
  ProfileReply,
  TokenReply,
} from '../clients/players.client';
import { toHttpException } from '../clients/grpc-errors';
import { CredentialsDto } from './auth.dto';
import { AuthGuard, type AuthedRequest } from './auth.guard';

@Controller('api')
export class AuthController {
  constructor(private readonly players: PlayersClient) {}

  @Post('auth/register')
  async register(@Body() body: CredentialsDto): Promise<PlayerReply> {
    try {
      return await this.players.register(body.username, body.password);
    } catch (err) {
      throw toHttpException(err);
    }
  }

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: CredentialsDto): Promise<TokenReply> {
    try {
      return await this.players.login(body.username, body.password);
    } catch (err) {
      throw toHttpException(err);
    }
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() req: AuthedRequest): Promise<ProfileReply> {
    try {
      return await this.players.getProfile(req.player.playerId);
    } catch (err) {
      throw toHttpException(err);
    }
  }
}
