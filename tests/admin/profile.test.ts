import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import {
  AdminNotFoundError,
  AdminValidationError,
  EmailAlreadyInUseError,
} from '../../src/errors/admin_errors';
import type { PrismaClient } from '../../src/generated/prisma/client';
import {
  getAdminProfile,
  updateAdminProfile,
  validateProfileUpdate,
} from '../../src/service/admin_service';

function fixture() {
  const record = {
    id: 'admin-1',
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@elite.com',
    role: 'ADMIN',
    passwordHash: 'must-not-be-returned',
  };
  const findUnique = mock.fn(async (_query: unknown) => record);
  const findFirst = mock.fn(
    async (_query: unknown): Promise<{ id: string } | null> => null,
  );
  const update = mock.fn(async (query: { data: Record<string, string> }) => ({
    ...record,
    ...query.data,
  }));
  const database = {
    user: { findUnique, findFirst, update },
  } as unknown as PrismaClient;
  return { database, record, findUnique, findFirst, update };
}

test('profile retrieval selects the requested admin and excludes secrets', async () => {
  const { database, findUnique } = fixture();
  assert.deepEqual(await getAdminProfile(database, 'admin-1'), {
    id: 'admin-1',
    name: 'Admin User',
    email: 'admin@elite.com',
    role: 'ADMIN',
  });
  assert.deepEqual(findUnique.mock.calls[0]?.arguments, [
    {
      where: { id: 'admin-1' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
    },
  ]);
});

test('profile retrieval rejects a missing admin', async () => {
  const database = {
    user: { findUnique: mock.fn(async () => null) },
  } as unknown as PrismaClient;
  await assert.rejects(
    getAdminProfile(database, 'missing'),
    AdminNotFoundError,
  );
});

test('profile validation normalizes input and strips identifying and sensitive fields', () => {
  assert.deepEqual(
    validateProfileUpdate({
      name: ' Grace Hopper ',
      email: ' GRACE@ELITE.COM ',
      id: 'another-user',
      role: 'CUSTOMER',
      password: 'must-not-be-used',
    }),
    { name: 'Grace Hopper', email: 'grace@elite.com' },
  );
});

test('profile validation rejects invalid fields with specific messages', () => {
  for (const [body, message] of [
    [null, 'Profile details are required.'],
    [{ email: 'a@elite.com' }, 'Name is required.'],
    [{ name: ' ', email: 'a@elite.com' }, 'Name is required.'],
    [
      { name: 'A'.repeat(101), email: 'a@elite.com' },
      'Name must be 100 characters or fewer.',
    ],
    [{ name: 'Grace' }, 'Email address is required.'],
    [{ name: 'Grace', email: 'invalid' }, 'Enter a valid email address.'],
    [
      { name: 'Grace', email: `${'a'.repeat(245)}@elite.com` },
      'Enter a valid email address.',
    ],
  ] as const) {
    assert.throws(
      () => validateProfileUpdate(body),
      (error: unknown) =>
        error instanceof AdminValidationError && error.message === message,
    );
  }
});

test('profile update splits at the first space and writes only allowed fields', async () => {
  const { database, update, findFirst } = fixture();
  const result = await updateAdminProfile(database, 'admin-1', {
    name: 'Grace Brewster Hopper',
    email: 'grace@elite.com',
  });
  assert.deepEqual(result, {
    id: 'admin-1',
    name: 'Grace Brewster Hopper',
    email: 'grace@elite.com',
    role: 'ADMIN',
  });
  assert.deepEqual(update.mock.calls[0]?.arguments, [
    {
      where: { id: 'admin-1' },
      data: {
        firstName: 'Grace',
        lastName: 'Brewster Hopper',
        email: 'grace@elite.com',
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
    },
  ]);
  assert.deepEqual(findFirst.mock.calls[0]?.arguments, [
    {
      where: {
        id: { not: 'admin-1' },
        email: { equals: 'grace@elite.com', mode: 'insensitive' },
      },
      select: { id: true },
    },
  ]);
});

test('profile update accepts one-word names and unchanged own email', async () => {
  const { database, update } = fixture();
  assert.deepEqual(
    await updateAdminProfile(database, 'admin-1', {
      name: 'Grace',
      email: 'admin@elite.com',
    }),
    { id: 'admin-1', name: 'Grace', email: 'admin@elite.com', role: 'ADMIN' },
  );
  assert.equal(update.mock.calls[0]?.arguments[0].data.lastName, '');
});

test('profile update rejects duplicate emails without writing', async () => {
  const { database, findFirst, update } = fixture();
  findFirst.mock.mockImplementation(async () => ({ id: 'other-user' }));
  await assert.rejects(
    updateAdminProfile(database, 'admin-1', {
      name: 'Grace',
      email: 'existing@elite.com',
    }),
    EmailAlreadyInUseError,
  );
  assert.equal(update.mock.callCount(), 0);
});

test('profile operations propagate database failures', async () => {
  const { database, findUnique, update } = fixture();
  const failure = new Error('Database unavailable');
  findUnique.mock.mockImplementation(async () => {
    throw failure;
  });
  update.mock.mockImplementation(async () => {
    throw failure;
  });
  await assert.rejects(
    getAdminProfile(database, 'admin-1'),
    (error: unknown) => error === failure,
  );
  await assert.rejects(
    updateAdminProfile(database, 'admin-1', {
      name: 'Grace',
      email: 'grace@elite.com',
    }),
    (error: unknown) => error === failure,
  );
});
