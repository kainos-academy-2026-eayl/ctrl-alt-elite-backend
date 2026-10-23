import type { ErrorRequestHandler } from 'express';
import { CustomerNotFoundError, CustomerValidationError } from './customers';
import { Prisma } from './generated/prisma/client';
import { RegistrationValidationError } from './registration';

const databaseUnavailableCodes = ['P1001', 'P1002', 'P1008', 'P1017'];

function isDatabaseUnavailable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      databaseUnavailableCodes.includes(error.code))
  );
}

export class ErrorHandler {
  handle: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (
      error instanceof RegistrationValidationError ||
      error instanceof CustomerValidationError
    ) {
      res.status(400).json({ message: error.message });
    } else if (error instanceof CustomerNotFoundError) {
      res.status(404).json({ message: error.message });
    } else if (isDatabaseUnavailable(error)) {
      console.error(
        'Database unavailable',
        error instanceof Error ? error.name : 'Unknown error',
      );
      res.status(503).json({ message: 'Service temporarily unavailable.' });
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      res
        .status(409)
        .json({ message: 'An account with this email already exists.' });
    } else if (
      error instanceof SyntaxError &&
      'type' in error &&
      error.type === 'entity.parse.failed'
    ) {
      res
        .status(400)
        .json({ message: 'Request body must contain valid JSON.' });
    } else if (
      error instanceof Error &&
      'type' in error &&
      error.type === 'entity.too.large'
    ) {
      res.status(413).json({ message: 'Request body is too large.' });
    } else {
      console.error(
        'Request failed',
        error instanceof Error ? error.name : 'Unknown error',
      );
      res.status(500).json({ message: 'Unable to complete the request.' });
    }
  };
}
