import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // S2-08: detrás de nginx el límite de login es por IP real; 1 salto
  // confía solo en lo que manda el proxy, no en lo que manda el cliente.
  app.set('trust proxy', 1);
  // Un cuerpo inválido responde 400 antes de llegar al controlador.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      stopAtFirstError: true,
    }),
  );
  app.useWebSocketAdapter(new WsAdapter(app)); // plain WebSocket, no Socket.IO
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Gateway listening on port ${port}`);
}

bootstrap();
