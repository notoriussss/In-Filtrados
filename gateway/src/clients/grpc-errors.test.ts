import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { status } from '@grpc/grpc-js';
import { toHttpException } from './grpc-errors';
import { HTTP_MESSAGES } from '../http.constants';

test('maps ALREADY_EXISTS to 409 preserving details message', () => {
  const http = toHttpException({
    code: status.ALREADY_EXISTS,
    details: 'Ya existe',
  });
  assert.equal(http.getStatus(), 409);
  assert.equal(http.message, 'Ya existe');
});

test('maps standard gRPC codes to corresponding HTTP statuses', () => {
  const unauth = toHttpException({
    code: status.UNAUTHENTICATED,
    details: 'Token inválido',
  });
  assert.equal(unauth.getStatus(), 401);
  assert.equal(unauth.message, 'Token inválido');

  const notFound = toHttpException({
    code: status.NOT_FOUND,
    details: 'No encontrado',
  });
  assert.equal(notFound.getStatus(), 404);
  assert.equal(notFound.message, 'No encontrado');

  const unavail = toHttpException({
    code: status.UNAVAILABLE,
    details: 'Unavailable endpoint',
  });
  assert.equal(unavail.getStatus(), 503);
  assert.equal(unavail.message, HTTP_MESSAGES.SERVICE_UNAVAILABLE);

  const invalidArg = toHttpException({
    code: status.INVALID_ARGUMENT,
    details: 'Argumento inválido',
  });
  assert.equal(invalidArg.getStatus(), 400);
  assert.equal(invalidArg.message, 'Argumento inválido');
});

test('maps non-gRPC or unknown errors to 500 internal error', () => {
  const http = toHttpException(new Error('boom'));
  assert.equal(http.getStatus(), 500);
  assert.equal(http.message, HTTP_MESSAGES.INTERNAL);
});
