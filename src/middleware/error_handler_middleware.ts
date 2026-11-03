import type { ErrorRequestHandler } from 'express';
import {
  AdminNotFoundError,
  AdminValidationError,
  EmailAlreadyInUseError,
  IncorrectPasswordError,
  SamePasswordError,
} from '../errors/admin_errors';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../errors/appErrors';
import {
  CustomerEmailInUseError,
  CustomerNotFoundError,
  CustomerValidationError,
} from '../errors/customer_errors';
import { RoleNotDeterminedError } from '../errors/login_errors';
import { RegistrationValidationError } from '../errors/registration_errors';
import { Prisma } from '../generated/prisma/client';

const databaseUnavailableCodes = ['P1001', 'P1002', 'P1008', 'P1017'];

function isDatabaseUnavailable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      databaseUnavailableCodes.includes(error.code))
  );
}

export class ErrorHandler {
  handle: ErrorRequestHandler = (error: unknown, req, res, _next) => {
    const isAdminManagedEndpoint =
      req.path === '/api/admin/profile' ||
      req.path === '/api/admin/change-password' ||
      /^\/api\/admin\/customers\/[^/]+(?:\/password)?$/.test(req.path);
    if (
      error instanceof RegistrationValidationError ||
      error instanceof CustomerValidationError ||
      error instanceof AdminValidationError ||
      error instanceof IncorrectPasswordError ||
      error instanceof SamePasswordError
    ) {
      res.status(400).json({ message: error.message });
    } else if (error instanceof ValidationError) {
      res.status(400).json({ message: error.message, errors: error.errors });
    } else if (error instanceof NotFoundError) {
      res.status(404).json({ message: error.message });
    } else if (error instanceof ConflictError) {
      res.status(409).json({ message: error.message });
    } else if (error instanceof EmailAlreadyInUseError) {
      res.status(409).json({ message: error.message });
    } else if (
      error instanceof CustomerNotFoundError ||
      error instanceof AdminNotFoundError
    ) {
      res.status(404).json({ message: error.message });
    } else if (error instanceof RoleNotDeterminedError) {
      if (isAdminManagedEndpoint) {
        console.error('User role could not be determined', error);
      } else {
        console.error('User role could not be determined');
      }
      res.status(500).json({
        message: isAdminManagedEndpoint
          ? 'Something went wrong.'
          : 'Unable to determine the account role.',
      });
    } else if (isDatabaseUnavailable(error)) {
      console.error(
        'Database unavailable',
        isAdminManagedEndpoint
          ? error
          : error instanceof Error
            ? error.name
            : 'Unknown error',
      );
      res.status(isAdminManagedEndpoint ? 500 : 503).json({
        message: isAdminManagedEndpoint
          ? 'Something went wrong.'
          : 'Service temporarily unavailable.',
      });
    } else if (error instanceof CustomerEmailInUseError) {
      res.status(409).json({ message: error.message });
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      res.status(409).json({
        message: isAdminManagedEndpoint
          ? 'Email is already in use.'
          : 'An account with this email already exists.',
      });
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
        isAdminManagedEndpoint
          ? error
          : error instanceof Error
            ? error.name
            : 'Unknown error',
      );
      res.status(500).json({
        message: isAdminManagedEndpoint
          ? 'Something went wrong.'
          : 'Unable to complete the request.',
      });
    }
  };
}
