const limits = {
  requiredStringLength: 1,
  nameLength: 100,
  emailLength: 254,
  searchLength: 200,
  maxPageSize: 100,
} as const;

const sortOptions = ['nameAsc', 'nameDesc', 'newest', 'oldest'] as const;

export const customerResources = {
  limits,
  defaults: {
    page: 1,
    pageSize: 10,
    sort: 'newest',
  },
  sortOptions,
  messages: {
    search: `search must be a string of at most ${limits.searchLength} characters.`,
    queryEmail: `email must be a string of at most ${limits.emailLength} characters.`,
    page: 'page must be a positive whole number.',
    pageSize: `pageSize must be a whole number between 1 and ${limits.maxPageSize}.`,
    sort: `sort must be one of: ${sortOptions.join(', ')}.`,
    firstNameRequired: 'First name is required.',
    firstNameLength: `First name must be ${limits.nameLength} characters or fewer.`,
    lastNameLength: `Last name must be ${limits.nameLength} characters or fewer.`,
    invalidEmail: 'Enter a valid email address.',
    passwordRequired: 'New password and confirmation are required.',
    passwordMismatch: 'The new password and confirmation do not match.',
    detailsRequired: 'Customer details are required.',
    invalidQuery: 'Invalid customer query.',
    invalidDetails: 'Invalid customer details.',
    invalidPassword: 'Invalid password details.',
    notFound: 'Customer not found.',
    emailInUse: 'Email is already in use.',
  },
} as const;
