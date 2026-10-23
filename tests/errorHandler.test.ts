import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { Request, Response } from 'express';
import {
  CustomerNotFoundError,
  CustomerValidationError,
} from '../src/customers';
import { ErrorHandler } from '../src/errorHandler';
import { Prisma } from '../src/generated/prisma/client';
import { RoleNotDeterminedError } from '../src/login';
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
    name: 'returns 400 for customer query validation errors',
    error: new CustomerValidationError('page must be a positive whole number.'),
    statusCode: 400,
    message: 'page must be a positive whole number.',
  },
  {
    name: 'returns 404 when a customer is not found',
    error: new CustomerNotFoundError(),
    statusCode: 404,
    message: 'Customer not found.',
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
];

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
  new Prisma.PrismaClientInitializationError(
    "Can't reach database server",
    'test',
  ),
  new Prisma.PrismaClientKnownRequestError("Can't reach database server", {
    code: 'P1001',
    clientVersion: 'test',
  }),
]) {
  test(`returns and logs a 503 when the database is unavailable (${error.name})`, (context) => {
    const logger = context.mock.method(console, 'error', () => {});
    const { status, json } = handleError(error);
    assert.deepEqual(status.mock.calls[0]?.arguments, [503]);
    assert.deepEqual(json.mock.calls[0]?.arguments, [
      { message: 'Service temporarily unavailable.' },
    ]);
    assert.equal(logger.mock.callCount(), 1);
    assert.deepEqual(logger.mock.calls[0]?.arguments, [
      'Database unavailable',
      error.name,
    ]);
  });
}

test('returns and logs a 500 when the user role cannot be determined', (context) => {
  const logger = context.mock.method(console, 'error', () => {});
  const { status, json } = handleError(new RoleNotDeterminedError());
  assert.deepEqual(status.mock.calls[0]?.arguments, [500]);
  assert.deepEqual(json.mock.calls[0]?.arguments, [
    { message: 'Unable to determine the account role.' },
  ]);
  assert.equal(logger.mock.callCount(), 1);
});

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
