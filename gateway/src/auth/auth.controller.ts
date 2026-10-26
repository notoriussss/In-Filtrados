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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { toHttpException } from '../clients/grpc-errors';
import { SWAGGER } from '../http.constants';
import { LoginThrottlerGuard } from './login-throttler.guard';
import { CredentialsDto } from './auth.dto';
import { AuthGuard, type AuthedRequest } from './auth.guard';

@ApiTags(SWAGGER.TAG_AUTH)
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
  // S2-08: 10 intentos de login por minuto por usuario; el resto
  // responde 429 sin llegar siquiera a players.
  @UseGuards(LoginThrottlerGuard)
  async login(@Body() body: CredentialsDto): Promise<TokenReply> {
    try {
      return await this.players.login(body.username, body.password);
    } catch (err) {
      throw toHttpException(err);
    }
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async me(@Req() req: AuthedRequest): Promise<ProfileReply> {
    try {
      return await this.players.getProfile(req.player.playerId);
    } catch (err) {
      throw toHttpException(err);
    }
  }
}
