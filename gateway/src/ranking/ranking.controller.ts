import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SWAGGER } from '../http.constants';
import { PlayersClient, RankingReply } from '../clients/players.client';
import { toHttpException } from '../clients/grpc-errors';
import { AuthGuard } from '../auth/auth.guard';

// Ranking: todos los jugadores con sus estadísticas, de más a menos
// victorias (players los ordena y pone el tope de 100).
@ApiTags(SWAGGER.TAG_RANKING)
@ApiBearerAuth()
@Controller('api/ranking')
@UseGuards(AuthGuard)
export class RankingController {
  constructor(private readonly players: PlayersClient) {}

  @Get()
  @ApiOkResponse({ type: RankingReply })
  async ranking(): Promise<RankingReply> {
    try {
      return await this.players.getRanking();
    } catch (err) {
      throw toHttpException(err);
    }
  }
}
