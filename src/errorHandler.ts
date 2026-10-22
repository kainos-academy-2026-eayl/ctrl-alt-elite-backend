import type { ErrorRequestHandler } from 'express';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from './errors/appErrors';
import { Prisma } from './generated/prisma/client';
import { RegistrationValidationError } from './registration';

export class ErrorHandler {
  handle: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof RegistrationValidationError) {
      res.status(400).json({ message: error.message });
    } else if (error instanceof ValidationError) {
      res.status(400).json({ message: error.message, errors: error.errors });
    } else if (error instanceof NotFoundError) {
      res.status(404).json({ message: error.message });
    } else if (error instanceof ConflictError) {
      res.status(409).json({ message: error.message });
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
