import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hash } from 'argon2';
import type { PrismaClient } from '../src/generated/prisma/client';
import {
  authenticateUser,
  InvalidCredentialsError,
  LoginValidationError,
  validateLogin,
} from '../src/login';

const password = 'Password1@';

async function databaseWith(role: 'CUSTOMER' | 'ADMIN') {
  const user = {
    id: 'user-1',
    firstName: 'Caolan',
    lastName: 'Example',
    email: 'caolan@example.com',
    passwordHash: await hash(password),
    role,
    createdAt: new Date(),
  };
  return {
    user: {
      findUnique: async ({ where }: { where: { email: string } }) =>
        where.email === user.email ? user : null,
    },
  } as unknown as PrismaClient;
}

test('normalises the email and keeps the password unchanged', () => {
  assert.deepEqual(
    validateLogin({ email: ' CAOLAN@example.com ', password: ' pass ' }),
    { email: 'caolan@example.com', password: ' pass ' },
  );
});

test('rejects invalid login bodies', () => {
  const invalid: unknown[] = [
    undefined,
    null,
    [],
    'login',
    {},
    { email: 'a@b.c' },
    { password },
    { email: ' ', password },
    { email: 'a@b.c', password: '' },
    { email: 1, password },
    { email: 'a@b.c', password: 1 },
    { email: 'a@b.c', password: 'a'.repeat(129) },
  ];
  for (const input of invalid) {
    assert.throws(() => validateLogin(input), LoginValidationError);
  }
});

test('returns the user and role without the password hash', async () => {
  for (const role of ['CUSTOMER', 'ADMIN'] as const) {
    const user = await authenticateUser(await databaseWith(role), {
      email: 'caolan@example.com',
      password,
    });
    assert.deepEqual(user, {
      id: 'user-1',
      firstName: 'Caolan',
      lastName: 'Example',
      email: 'caolan@example.com',
      role,
    });
  }
});

test('rejects a wrong password and an unknown email with the same error', async () => {
  const database = await databaseWith('CUSTOMER');
  for (const login of [
    { email: 'caolan@example.com', password: 'Wrong1@pass' },
    { email: 'nobody@example.com', password },
  ]) {
    await assert.rejects(authenticateUser(database, login), {
      name: 'Error',
      message: 'Invalid email or password.',
      constructor: InvalidCredentialsError,
    });
  }
});
