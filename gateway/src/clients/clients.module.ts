import { Global, Module } from '@nestjs/common';
import { MatchClient } from './match.client';
import { PlayersClient } from './players.client';

@Global()
@Module({
  providers: [MatchClient, PlayersClient],
  exports: [MatchClient, PlayersClient],
})
export class ClientsModule {}
