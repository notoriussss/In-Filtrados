import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app)); // plain WebSocket, no Socket.IO
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Gateway listening on port ${port}`);
}

bootstrap();
