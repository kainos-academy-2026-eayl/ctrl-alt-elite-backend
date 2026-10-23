import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import {
  CustomerNotFoundError,
  CustomerValidationError,
  getCustomer,
  listCustomers,
  validateCustomerQuery,
} from '../src/customers';
import type { PrismaClient } from '../src/generated/prisma/client';

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
