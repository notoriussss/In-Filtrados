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
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SWAGGER } from '../http.constants';
import { PlayersClient, ShopReply } from '../clients/players.client';
import { toHttpException } from '../clients/grpc-errors';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard';
import { BuyItemDto } from './shop.dto';

// Tienda: los personajes gota y los accesorios se compran con monedas.
@ApiTags(SWAGGER.TAG_SHOP)
@ApiBearerAuth()
@Controller('api/shop')
@UseGuards(AuthGuard)
export class ShopController {
  constructor(private readonly players: PlayersClient) {}

  @Get()
  @ApiOkResponse({ type: ShopReply })
  async shop(@Req() req: AuthedRequest): Promise<ShopReply> {
    try {
      return await this.players.getShop(req.player.playerId);
    } catch (err) {
      throw toHttpException(err);
    }
  }

  @Post('buy')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ShopReply })
  async buy(
    @Req() req: AuthedRequest,
    @Body() body: BuyItemDto,
  ): Promise<ShopReply> {
    try {
      return await this.players.buyItem(req.player.playerId, body.itemId);
    } catch (err) {
      throw toHttpException(err);
    }
  }
}
