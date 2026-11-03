import { ConflictError, NotFoundError, ValidationError } from './appErrors';

export class OrderValidationError extends ValidationError {
  constructor() {
    super([
      {
        field: 'items',
        message: 'Please provide valid order details.',
      },
    ]);
  }
}

export class OrderProductNotFoundError extends NotFoundError {
  constructor() {
    super('One or more products were not found.');
  }
}

export class InsufficientStockError extends ConflictError {
  constructor() {
    super('Insufficient stock for one or more products.');
  }
}
