import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { hash } from 'argon2';
import type { PrismaClient } from '../src/generated/prisma/client';
import { authenticateUser, RoleNotDeterminedError } from '../src/login';

const password = 'Password123';
let passwordHash: string;

before(async () => {
  passwordHash = await hash(password);
});

function databaseReturning(user: Record<string, unknown> | null) {
  const findUnique = async () => user;
  return { user: { findUnique } } as unknown as PrismaClient;
}

const credentials = { email: ' Admin@Company.com ', password };

for (const role of ['CUSTOMER', 'ADMIN']) {
  test(`returns the user id, email and ${role} role on success`, async () => {
    const database = databaseReturning({
      id: 'user-1',
      email: 'admin@company.com',
      passwordHash,
      role,
    });
    assert.deepEqual(await authenticateUser(database, credentials), {
      userId: 'user-1',
      email: 'admin@company.com',
      role,
    });
  });
}

test('looks the user up by trimmed, lowercased email', async () => {
  let where: unknown;
  const database = {
    user: {
      findUnique: async (query: { where: unknown }) => {
        where = query.where;
        return null;
      },
    },
  } as unknown as PrismaClient;
  await authenticateUser(database, credentials);
  assert.deepEqual(where, { email: 'admin@company.com' });
});

test('returns null for an incorrect password', async () => {
  const database = databaseReturning({
    id: 'user-1',
    email: 'admin@company.com',
    passwordHash,
    role: 'ADMIN',
  });
  assert.equal(
    await authenticateUser(database, { ...credentials, password: 'wrong' }),
    null,
  );
});

test('returns null when the user cannot be found', async () => {
  assert.equal(
    await authenticateUser(databaseReturning(null), credentials),
    null,
  );
});

test('returns null for malformed credentials', async () => {
  const database = databaseReturning(null);
  for (const input of [
    undefined,
    null,
    'credentials',
    {},
    { email: 1, password },
    { email: 'a@b.c', password: 1 },
    { email: `${'a'.repeat(250)}@b.com`, password },
    { email: 'a@b.c', password: 'a'.repeat(129) },
  ]) {
    assert.equal(await authenticateUser(database, input), null);
  }
});

test('throws when the role cannot be determined', async () => {
  for (const role of [null, undefined, 'SUPERUSER']) {
    const database = databaseReturning({
      id: 'user-1',
      email: 'admin@company.com',
      passwordHash,
      role,
    });
    await assert.rejects(
      authenticateUser(database, credentials),
      RoleNotDeterminedError,
    );
  }
});

test('propagates database failures', async () => {
  const failure = new Error('Database unavailable');
  const database = {
    user: {
      findUnique: async () => {
        throw failure;
      },
    },
  } as unknown as PrismaClient;
  await assert.rejects(authenticateUser(database, credentials), failure);
});
