import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AUTH_MESSAGES, LOGIN_RATE_LIMIT } from './auth/auth.constants';
import { RoomsController } from './rooms/rooms.controller';
import { RankingController } from './ranking/ranking.controller';
import { ShopController } from './shop/shop.controller';

@Module({
  imports: [
    // S2-08: 10 intentos de login por minuto por IP, medidos por la
    // librería y con mensaje nuestro en español.
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: LOGIN_RATE_LIMIT.TTL_MS,
          limit: LOGIN_RATE_LIMIT.MAX_ATTEMPTS,
        },
      ],
      errorMessage: AUTH_MESSAGES.TOO_MANY_LOGIN_ATTEMPTS,
    }),
  ],
  controllers: [
    AuthController,
    RoomsController,
    ShopController,
    RankingController,
  ],
  providers: [AuthGuard],
})
export class ApiModule {}
