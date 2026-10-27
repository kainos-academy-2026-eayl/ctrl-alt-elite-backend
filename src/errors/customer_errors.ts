import { customerResources } from '../resources/customer_resources';

const { messages } = customerResources;

export class CustomerValidationError extends Error {}

export class CustomerNotFoundError extends Error {
  constructor() {
    super(messages.notFound);
  }
}

export class CustomerEmailInUseError extends Error {
  constructor() {
    super(messages.emailInUse);
  }
}
