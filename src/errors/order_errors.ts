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

function formatPounds(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(pence / 100);
}

export class InsufficientCreditError extends ConflictError {
  constructor(balancePence: number, totalPence: number) {
    super(
      `Your credit balance of ${formatPounds(balancePence)} is not enough to pay ${formatPounds(totalPence)}.`,
    );
  }
}

export class OrderNotFoundError extends NotFoundError {
  constructor() {
    super('Order not found.');
  }
}

export class AccountNotFoundError extends NotFoundError {
  constructor() {
    super('Account not found.');
  }
}
