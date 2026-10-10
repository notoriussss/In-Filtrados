import { HttpException, HttpStatus } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { HTTP_MESSAGES } from '../http.constants';

const STATUS_MAP: Record<number, HttpStatus> = {
  [status.INVALID_ARGUMENT]: HttpStatus.BAD_REQUEST,
  [status.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED,
  [status.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [status.ALREADY_EXISTS]: HttpStatus.CONFLICT,
  [status.RESOURCE_EXHAUSTED]: HttpStatus.CONFLICT,
  [status.UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
  [status.DEADLINE_EXCEEDED]: HttpStatus.SERVICE_UNAVAILABLE,
};

export function toHttpException(err: any): HttpException {
  const code = err?.code;
  if (typeof code === 'number' && code in STATUS_MAP) {
    const httpStatus = STATUS_MAP[code];
    if (httpStatus === HttpStatus.SERVICE_UNAVAILABLE) {
      return new HttpException(
        HTTP_MESSAGES.SERVICE_UNAVAILABLE,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const message = err.details ?? HTTP_MESSAGES.INTERNAL;
    return new HttpException(message, httpStatus);
  }
  return new HttpException(
    HTTP_MESSAGES.INTERNAL,
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}
