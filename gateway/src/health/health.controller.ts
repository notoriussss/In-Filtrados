import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { SWAGGER } from '../http.constants';
import * as net from 'net';
import { CIRCUIT_OPEN, isCircuitOpen } from '../clients/resilience';

@ApiTags(SWAGGER.TAG_HEALTH)
@Controller('health')
export class HealthController {
  private checkGrpcClient(
    addrEnvVar: string,
    defaultAddr: string,
  ): Promise<string> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve('fail: timeout (1s)');
      }, 1000);

      try {
        const addr = process.env[addrEnvVar] || defaultAddr;
        const [host, portStr] = addr.split(':');
        const port = parseInt(portStr || '50051', 10);

        const socket = new net.Socket();
        socket.setTimeout(1000);

        socket.on('connect', () => {
          clearTimeout(timeout);
          socket.destroy();
          resolve('ok');
        });

        socket.on('error', (err: Error) => {
          clearTimeout(timeout);
          socket.destroy();
          resolve(`fail: ${err.message || 'connection failed'}`);
        });

        socket.on('timeout', () => {
          clearTimeout(timeout);
          socket.destroy();
          resolve('fail: timeout (1s)');
        });

        socket.connect(port, host);
      } catch (err: any) {
        clearTimeout(timeout);
        resolve(`fail: ${err.message || 'error'}`);
      }
    });
  }

  @Get()
  async getHealth(@Res() res: Response) {
    const [matchCheck, playersCheck] = await Promise.all([
      isCircuitOpen('match')
        ? CIRCUIT_OPEN
        : this.checkGrpcClient('MATCH_GRPC_ADDR', 'localhost:50051'),
      isCircuitOpen('players')
        ? CIRCUIT_OPEN
        : this.checkGrpcClient('PLAYERS_GRPC_ADDR', 'localhost:50052'),
    ]);

    const checks = {
      match: matchCheck,
      players: playersCheck,
    };

    const isDegraded = Object.values(checks).some((val) => val !== 'ok');
    const status = isDegraded ? 'degraded' : 'ok';
    const httpStatus = isDegraded
      ? HttpStatus.SERVICE_UNAVAILABLE
      : HttpStatus.OK;

    return res.status(httpStatus).json({
      status,
      service: 'gateway',
      checks,
    });
  }
}
