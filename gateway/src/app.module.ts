import { Module } from '@nestjs/common';
import { ApiModule } from './api.module';
import { ClientsModule } from './clients/clients.module';
import { GameModule } from './game/game.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ClientsModule,
    HealthModule,
    GameModule,
    ApiModule,
  ],
})
export class AppModule {}
