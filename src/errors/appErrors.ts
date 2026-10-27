export interface FieldError {
  field: string;
  message: string;
}

export class ValidationError extends Error {
  public readonly errors: readonly FieldError[];

  constructor(errors: readonly FieldError[]) {
    super(errors[0]?.message ?? 'Invalid request.');
    this.errors = errors;
  }
}

export class NotFoundError extends Error {}

export class ConflictError extends Error {}
