export class AdminValidationError extends Error {}

export class IncorrectPasswordError extends Error {
  constructor() {
    super('Current password is incorrect.');
  }
}

export class SamePasswordError extends Error {
  constructor() {
    super('New password must be different from your current password.');
  }
}

export class EmailAlreadyInUseError extends Error {
  constructor() {
    super('Email is already in use.');
  }
}

export class AdminNotFoundError extends Error {
  constructor() {
    super('Administrator not found.');
  }
}
