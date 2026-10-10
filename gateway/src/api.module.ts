import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { RoomsController } from './rooms/rooms.controller';

@Module({
  controllers: [AuthController, RoomsController],
  providers: [AuthGuard],
})
export class ApiModule {}
