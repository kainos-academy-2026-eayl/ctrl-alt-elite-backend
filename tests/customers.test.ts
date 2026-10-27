import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { verify } from 'argon2';
import {
  CustomerEmailInUseError,
  CustomerNotFoundError,
  CustomerValidationError,
} from '../src/errors/customer_errors';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client';
import {
  getCustomer,
  listCustomers,
  resetCustomerPassword,
  updateCustomer,
  validateCustomerPasswordReset,
  validateCustomerQuery,
  validateCustomerUpdate,
} from '../src/service/customer_service';

function firstArg<T>(fn: { mock: { calls: { arguments: unknown[] }[] } }): T {
  return fn.mock.calls[0]?.arguments[0] as T;
}

const record = {
  id: 'abc',
  firstName: 'John',
  lastName: 'Smith',
  email: 'john@email.com',
  createdAt: new Date('2026-10-20T23:30:00.000Z'),
};

function fakeDatabase(users: unknown[], total = users.length) {
  const findMany = mock.fn(async (_args: unknown) => users);
  const count = mock.fn(async (_args: unknown) => total);
  const findUnique = mock.fn(async (_args: unknown) => users[0] ?? null);
  const database = {
    user: { findMany, count, findUnique },
  } as unknown as PrismaClient;
  return { database, findMany, count, findUnique };
}

test('applies defaults when no query parameters are supplied', () => {
  assert.deepEqual(validateCustomerQuery({}), {
    sort: 'newest',
    page: 1,
    pageSize: 10,
  });
});

test('parses and trims supplied query parameters', () => {
  assert.deepEqual(
    validateCustomerQuery({
      search: ' john ',
      email: ' a@b.c ',
      sort: 'nameDesc',
      page: '2',
      pageSize: '100',
    }),
    {
      search: 'john',
      email: 'a@b.c',
      sort: 'nameDesc',
      page: 2,
      pageSize: 100,
    },
  );
  assert.equal(validateCustomerQuery({ search: '  ' }).search, undefined);
});

test('rejects invalid query parameters', () => {
  const invalid: unknown[] = [
    { sort: 'random' },
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { page: 'abc' },
    { page: '99999999999999999999' },
    { pageSize: '0' },
    { pageSize: '101' },
    { pageSize: 'ten' },
    { search: 'a'.repeat(201) },
    { email: 'a'.repeat(255) },
    { search: ['a', 'b'] },
    { page: ['1', '2'] },
  ];
  for (const query of invalid) {
    assert.throws(() => validateCustomerQuery(query), CustomerValidationError);
  }
});

test('lists customers with registration dates and pagination metadata', async () => {
  const { database, findMany } = fakeDatabase([record], 25);
  const result = await listCustomers(
    database,
    validateCustomerQuery({ page: '2', pageSize: '10' }),
  );
  assert.deepEqual(result, {
    customers: [
      {
        id: 'abc',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@email.com',
        registrationDate: '2026-10-20',
      },
    ],
    page: 2,
    pageSize: 10,
    total: 25,
    totalPages: 3,
  });
  const args = firstArg<{
    skip: number;
    take: number;
  }>(findMany);
  assert.equal(args.skip, 10);
  assert.equal(args.take, 10);
});

test('returns an empty result set when nothing matches', async () => {
  const { database } = fakeDatabase([]);
  assert.deepEqual(await listCustomers(database, validateCustomerQuery({})), {
    customers: [],
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });
});

test('maps each sort option to a database ordering', async () => {
  const expected = {
    nameAsc: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
    nameDesc: [{ firstName: 'desc' }, { lastName: 'desc' }, { id: 'desc' }],
    newest: [{ createdAt: 'desc' }, { id: 'desc' }],
    oldest: [{ createdAt: 'asc' }, { id: 'asc' }],
  };
  for (const [sort, orderBy] of Object.entries(expected)) {
    const { database, findMany } = fakeDatabase([]);
    await listCustomers(database, validateCustomerQuery({ sort }));
    const args = firstArg<{ orderBy: unknown }>(findMany);
    assert.deepEqual(args.orderBy, orderBy);
  }
});

test('searches every word against names and email case-insensitively', async () => {
  const { database, findMany, count } = fakeDatabase([]);
  await listCustomers(
    database,
    validateCustomerQuery({ search: 'john  smith', email: 'JOHN@' }),
  );
  const where = {
    AND: [
      {
        OR: [
          { firstName: { contains: 'john', mode: 'insensitive' } },
          { lastName: { contains: 'john', mode: 'insensitive' } },
        ],
      },
      {
        OR: [
          { firstName: { contains: 'smith', mode: 'insensitive' } },
          { lastName: { contains: 'smith', mode: 'insensitive' } },
        ],
      },
      { email: { contains: 'JOHN@', mode: 'insensitive' } },
    ],
  };
  assert.deepEqual(firstArg<{ where: unknown }>(findMany).where, where);
  assert.deepEqual(firstArg<{ where: unknown }>(count).where, where);
});

test('returns a single customer', async () => {
  const { database, findUnique } = fakeDatabase([record]);
  assert.deepEqual(await getCustomer(database, 'abc'), {
    id: 'abc',
    firstName: 'John',
    lastName: 'Smith',
    email: 'john@email.com',
    registrationDate: '2026-10-20',
  });
  assert.deepEqual(firstArg<{ where: unknown }>(findUnique).where, {
    id: 'abc',
  });
});

test('throws not found for an unknown customer', async () => {
  const { database } = fakeDatabase([]);
  await assert.rejects(getCustomer(database, 'missing'), CustomerNotFoundError);
});

function mutationDatabase(existing = true, duplicate = false) {
  const findUnique = mock.fn(async (_args: unknown) =>
    existing ? { id: record.id } : null,
  );
  const findFirst = mock.fn(async (_args: unknown) =>
    duplicate ? { id: 'another-customer' } : null,
  );
  const update = mock.fn(
    async (args: {
      data: {
        firstName?: string;
        lastName?: string;
        email?: string;
        passwordHash?: string;
      };
    }) => ({ ...record, ...args.data }),
  );
  const database = {
    user: { findUnique, findFirst, update },
  } as unknown as PrismaClient;
  return { database, findUnique, findFirst, update };
}

test('customer update validation trims values, normalizes email and ignores extra fields', () => {
  assert.deepEqual(
    validateCustomerUpdate({
      firstName: ' Grace ',
      lastName: ' Hopper ',
      email: ' GRACE@EXAMPLE.COM ',
      id: 'another-customer',
      role: 'ADMIN',
      passwordHash: 'must-not-be-used',
      registrationDate: '1900-01-01',
    }),
    {
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.com',
    },
  );
});

test('customer update validation accepts omitted and empty last names', () => {
  const details = { firstName: 'Grace', email: 'grace@example.com' };
  assert.deepEqual(validateCustomerUpdate(details), details);
  assert.deepEqual(validateCustomerUpdate({ ...details, lastName: '  ' }), {
    ...details,
    lastName: '',
  });
  assert.equal(
    validateCustomerUpdate({
      ...details,
      firstName: 'A'.repeat(100),
      lastName: 'B'.repeat(100),
    }).firstName.length,
    100,
  );
});

test('customer update validation rejects invalid fields with specific messages', () => {
  const details = { firstName: 'Grace', email: 'grace@example.com' };
  const cases = [
    [null, 'Customer details are required.'],
    [{ email: details.email }, 'First name is required.'],
    [{ ...details, firstName: '  ' }, 'First name is required.'],
    [{ ...details, firstName: 123 }, 'First name is required.'],
    [
      { ...details, firstName: 'A'.repeat(101) },
      'First name must be 100 characters or fewer.',
    ],
    [
      { ...details, lastName: 'B'.repeat(101) },
      'Last name must be 100 characters or fewer.',
    ],
    [
      { ...details, lastName: 123 },
      'Last name must be 100 characters or fewer.',
    ],
    [{ firstName: 'Grace' }, 'Enter a valid email address.'],
    [{ ...details, email: '  ' }, 'Enter a valid email address.'],
    [{ ...details, email: 123 }, 'Enter a valid email address.'],
    [{ ...details, email: 'invalid' }, 'Enter a valid email address.'],
    [
      { ...details, email: `${'a'.repeat(250)}@x.com` },
      'Enter a valid email address.',
    ],
  ] as const;
  for (const [body, message] of cases) {
    assert.throws(
      () => validateCustomerUpdate(body),
      (error: unknown) =>
        error instanceof CustomerValidationError && error.message === message,
    );
  }
});

test('updateCustomer writes only customer details and returns the public customer shape', async () => {
  const { database, findUnique, findFirst, update } = mutationDatabase();
  const details = {
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    role: 'ADMIN',
    passwordHash: 'must-not-be-used',
  };
  assert.deepEqual(await updateCustomer(database, record.id, details), {
    id: record.id,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    registrationDate: '2026-10-20',
  });
  assert.deepEqual(firstArg(findUnique), {
    where: { id: record.id },
    select: { id: true },
  });
  assert.deepEqual(firstArg(findFirst), {
    where: {
      id: { not: record.id },
      email: { equals: details.email, mode: 'insensitive' },
    },
    select: { id: true },
  });
  assert.deepEqual(firstArg(update), {
    where: { id: record.id },
    data: {
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.com',
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      createdAt: true,
    },
  });
});

test('updateCustomer preserves an omitted last name and allows clearing it or keeping own email', async () => {
  for (const lastName of [undefined, '']) {
    const { database, update } = mutationDatabase();
    const details = { firstName: 'Grace', email: record.email };
    const result = await updateCustomer(database, record.id, {
      ...details,
      ...(lastName === undefined ? {} : { lastName }),
    });
    assert.equal(result.lastName, lastName ?? record.lastName);
    assert.deepEqual(firstArg<{ data: unknown }>(update).data, {
      ...details,
      ...(lastName === undefined ? {} : { lastName }),
    });
  }
});

test('updateCustomer does not write when the customer is missing or email is duplicated', async () => {
  const details = { firstName: 'Grace', email: 'grace@example.com' };
  const missing = mutationDatabase(false);
  await assert.rejects(
    updateCustomer(missing.database, 'missing', details),
    CustomerNotFoundError,
  );
  assert.equal(missing.findFirst.mock.callCount(), 0);
  assert.equal(missing.update.mock.callCount(), 0);

  const duplicate = mutationDatabase(true, true);
  await assert.rejects(
    updateCustomer(duplicate.database, record.id, details),
    CustomerEmailInUseError,
  );
  assert.equal(duplicate.update.mock.callCount(), 0);
});

test('password reset validation requires matching nonempty strings', () => {
  const newPassword = 'NewCustomer456@';
  assert.deepEqual(
    validateCustomerPasswordReset({
      newPassword,
      confirmPassword: newPassword,
      role: 'ADMIN',
    }),
    { newPassword, confirmPassword: newPassword },
  );
  for (const body of [
    null,
    {},
    { newPassword },
    { newPassword, confirmPassword: '' },
    { newPassword: '', confirmPassword: '' },
    { newPassword: 123, confirmPassword: 123 },
  ]) {
    assert.throws(
      () => validateCustomerPasswordReset(body),
      (error: unknown) =>
        error instanceof CustomerValidationError &&
        error.message === 'New password and confirmation are required.',
    );
  }
  assert.throws(
    () =>
      validateCustomerPasswordReset({
        newPassword,
        confirmPassword: 'Different123@',
      }),
    (error: unknown) =>
      error instanceof CustomerValidationError &&
      error.message === 'The new password and confirmation do not match.',
  );
});

test('resetCustomerPassword writes only an Argon2 hash for the requested customer', async () => {
  const { database, update } = mutationDatabase();
  const newPassword = 'NewCustomer456@';
  await resetCustomerPassword(database, record.id, {
    newPassword,
    confirmPassword: newPassword,
  });
  assert.equal(update.mock.callCount(), 1);
  const args = firstArg<{
    where: { id: string };
    data: { passwordHash: string };
  }>(update);
  assert.deepEqual(args.where, { id: record.id });
  assert.deepEqual(Object.keys(args.data), ['passwordHash']);
  assert.notEqual(args.data.passwordHash, newPassword);
  assert.ok(await verify(args.data.passwordHash, newPassword));
  assert.equal(await verify(args.data.passwordHash, 'OldCustomer123@'), false);
});

test('resetCustomerPassword does not write for missing customers or invalid password strength', async () => {
  const missing = mutationDatabase(false);
  await assert.rejects(
    resetCustomerPassword(missing.database, 'missing', {
      newPassword: 'NewCustomer456@',
      confirmPassword: 'NewCustomer456@',
    }),
    CustomerNotFoundError,
  );
  assert.equal(missing.update.mock.callCount(), 0);

  for (const newPassword of [
    'short1@',
    'NoDigitsHere@',
    'NoSymbol123',
    `${'A'.repeat(127)}1@`,
  ]) {
    const { database, update } = mutationDatabase();
    await assert.rejects(
      resetCustomerPassword(database, record.id, {
        newPassword,
        confirmPassword: newPassword,
      }),
      (error: unknown) =>
        error instanceof CustomerValidationError &&
        error.message ===
          'Use 8 to 128 characters, including a digit and one of: @, £, $, %, &.',
    );
    assert.equal(update.mock.callCount(), 0);
  }
});

test('customer mutations map deleted records to not found and propagate other database errors', async () => {
  for (const operation of [
    (database: PrismaClient) =>
      updateCustomer(database, record.id, {
        firstName: 'Grace',
        email: 'grace@example.com',
      }),
    (database: PrismaClient) =>
      resetCustomerPassword(database, record.id, {
        newPassword: 'NewCustomer456@',
        confirmPassword: 'NewCustomer456@',
      }),
  ]) {
    for (const error of [
      new Prisma.PrismaClientKnownRequestError('Record deleted', {
        code: 'P2025',
        clientVersion: '7.10.1',
      }),
      new Error('Database unavailable'),
    ]) {
      const { database, update } = mutationDatabase();
      update.mock.mockImplementation(async () => {
        throw error;
      });
      await assert.rejects(
        operation(database),
        error instanceof Prisma.PrismaClientKnownRequestError
          ? (received: unknown) => received instanceof CustomerNotFoundError
          : (received: unknown) => received === error,
      );
    }
  }
});
