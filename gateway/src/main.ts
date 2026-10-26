import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { SWAGGER } from './http.constants';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // S2-08: detrás de nginx el límite de login es por IP real. Solo se
  // confía en proxies de la red interna de Docker o loopback, para que
  // una conexión directa al puerto 3000 no pueda falsificar la IP con
  // un encabezado X-Forwarded-For inventado.
  const trustProxyEnv = process.env.TRUST_PROXY;
  if (trustProxyEnv) {
    const num = Number(trustProxyEnv);
    app.set(
      'trust proxy',
      Number.isNaN(num) ? trustProxyEnv : num,
    );
  } else {
    app.set('trust proxy', 'loopback, 172.16.0.0/12');
  }
  // Un cuerpo inválido responde 400 antes de llegar al controlador.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      stopAtFirstError: true,
    }),
  );
  const swaggerConfig = new DocumentBuilder()
    .setTitle(SWAGGER.TITLE)
    .setDescription(SWAGGER.DESCRIPTION)
    .setVersion(SWAGGER.VERSION)
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    SWAGGER.PATH,
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );
  app.useWebSocketAdapter(new WsAdapter(app)); // plain WebSocket, no Socket.IO
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Gateway listening on port ${port}`);
}

bootstrap();
