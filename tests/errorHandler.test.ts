import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { Request, Response } from 'express';
import { ErrorHandler } from '../src/errorHandler';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../src/errors/appErrors';
import { Prisma } from '../src/generated/prisma/client';
import { RegistrationValidationError } from '../src/registration';

function handleError(error: unknown) {
  const status = mock.fn((_code: number): Response => response);
  const json = mock.fn((_body: unknown): Response => response);
  const response = { status, json } as unknown as Response;
  const next = mock.fn();
  new ErrorHandler().handle(error, {} as Request, response, next);
  return { status, json, next };
}

const cases = [
  {
    name: 'returns 400 for registration validation errors',
    error: new RegistrationValidationError('Invalid request details.'),
    statusCode: 400,
    message: 'Invalid request details.',
  },
  {
    name: 'returns 409 for a duplicate email',
    error: new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: 'test',
      },
    ),
    statusCode: 409,
    message: 'An account with this email already exists.',
  },
  {
    name: 'returns 400 for malformed JSON',
    error: Object.assign(new SyntaxError('Unexpected token'), {
      type: 'entity.parse.failed',
    }),
    statusCode: 400,
    message: 'Request body must contain valid JSON.',
  },
  {
    name: 'returns 413 for an oversized request body',
    error: Object.assign(new Error('Request entity too large'), {
      type: 'entity.too.large',
    }),
    statusCode: 413,
    message: 'Request body is too large.',
  },
  {
    name: 'returns 404 for a missing resource',
    error: new NotFoundError('Basket not found. Please start a new basket.'),
    statusCode: 404,
    message: 'Basket not found. Please start a new basket.',
  },
  {
    name: 'returns 409 for a conflicting request',
    error: new ConflictError('You already have the maximum'),
    statusCode: 409,
    message: 'You already have the maximum',
  },
];

test('returns 400 with field-level errors for validation errors', () => {
  const errors = [{ field: 'quantity', message: 'Quantity is invalid.' }];
  const { status, json } = handleError(new ValidationError(errors));
  assert.deepEqual(status.mock.calls[0]?.arguments, [400]);
  assert.deepEqual(json.mock.calls[0]?.arguments, [
    { message: 'Quantity is invalid.', errors },
  ]);
});

for (const { name, error, statusCode, message } of cases) {
  test(name, () => {
    const { status, json, next } = handleError(error);
    assert.equal(status.mock.callCount(), 1);
    assert.deepEqual(status.mock.calls[0]?.arguments, [statusCode]);
    assert.equal(json.mock.callCount(), 1);
    assert.deepEqual(json.mock.calls[0]?.arguments, [{ message }]);
    assert.equal(next.mock.callCount(), 0);
  });
}

for (const error of [
  new Error('Private database connection details'),
  'Private internal failure',
]) {
  test(`returns a safe 500 response for ${error instanceof Error ? 'unexpected errors' : 'non-Error failures'}`, (context) => {
    const logger = context.mock.method(console, 'error', () => {});
    const { status, json, next } = handleError(error);
    assert.deepEqual(status.mock.calls[0]?.arguments, [500]);
    assert.deepEqual(json.mock.calls[0]?.arguments, [
      { message: 'Unable to complete the request.' },
    ]);
    assert.equal(next.mock.callCount(), 0);
    assert.equal(logger.mock.callCount(), 1);
    assert.deepEqual(logger.mock.calls[0]?.arguments, [
      'Request failed',
      error instanceof Error ? 'Error' : 'Unknown error',
    ]);
  });
}
