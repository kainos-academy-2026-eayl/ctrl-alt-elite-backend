import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { hash, verify } from 'argon2';
import {
  AdminNotFoundError,
  AdminValidationError,
  IncorrectPasswordError,
  SamePasswordError,
} from '../../src/errors/admin_errors';
import type { PrismaClient } from '../../src/generated/prisma/client';
import {
  changeAdminPassword,
  validatePasswordChange,
} from '../../src/service/admin_service';

const currentPassword = 'OldPassword123';
const validChange = {
  currentPassword,
  newPassword: 'NewPassword1@',
  confirmPassword: 'NewPassword1@',
};
let passwordHash: string;
before(async () => {
  passwordHash = await hash(currentPassword);
});

function fixture(exists = true) {
  const findUnique = mock.fn(async (_query: unknown) =>
    exists ? { passwordHash } : null,
  );
  const update = mock.fn(async (_query: unknown) => ({}));
  const database = { user: { findUnique, update } } as unknown as PrismaClient;
  return { database, findUnique, update };
}

test('password validation returns only the public password fields', () => {
  assert.deepEqual(
    validatePasswordChange({ ...validChange, id: 'other-user', role: 'ADMIN' }),
    validChange,
  );
});

test('password validation requires all fields and matching confirmation', () => {
  for (const body of [
    null,
    {},
    { ...validChange, currentPassword: '' },
    { ...validChange, newPassword: 123 },
    { ...validChange, confirmPassword: undefined },
    { ...validChange, currentPassword: 'A'.repeat(129) },
  ]) {
    assert.throws(
      () => validatePasswordChange(body),
      (error: unknown) =>
        error instanceof AdminValidationError &&
        error.message === 'All password fields are required.',
    );
  }
  assert.throws(
    () =>
      validatePasswordChange({
        ...validChange,
        confirmPassword: 'Different1@',
      }),
    (error: unknown) =>
      error instanceof AdminValidationError &&
      error.message === 'The new password and confirmation do not match.',
  );
});

test('password change writes only a new hash for the requested admin', async () => {
  const { database, findUnique, update } = fixture();
  await changeAdminPassword(database, 'admin-1', validChange);
  assert.deepEqual(findUnique.mock.calls[0]?.arguments, [
    {
      where: { id: 'admin-1' },
      select: { passwordHash: true },
    },
  ]);
  assert.equal(update.mock.callCount(), 1);
  const query = update.mock.calls[0]?.arguments[0] as {
    where: { id: string };
    data: { passwordHash: string };
  };
  assert.deepEqual(query.where, { id: 'admin-1' });
  assert.deepEqual(Object.keys(query.data), ['passwordHash']);
  assert.notEqual(query.data.passwordHash, validChange.newPassword);
  assert.ok(await verify(query.data.passwordHash, validChange.newPassword));
  assert.equal(await verify(query.data.passwordHash, currentPassword), false);
});

test('password change rejects missing admins without writing', async () => {
  const { database, update } = fixture(false);
  await assert.rejects(
    changeAdminPassword(database, 'missing', validChange),
    AdminNotFoundError,
  );
  assert.equal(update.mock.callCount(), 0);
});

test('password change checks the current password before password policy', async () => {
  const { database, update } = fixture();
  await assert.rejects(
    changeAdminPassword(database, 'admin-1', {
      currentPassword: 'WrongPassword',
      newPassword: 'short',
      confirmPassword: 'short',
    }),
    IncorrectPasswordError,
  );
  assert.equal(update.mock.callCount(), 0);
});

test('password change rejects an unchanged password without writing', async () => {
  const { database, update } = fixture();
  await assert.rejects(
    changeAdminPassword(database, 'admin-1', {
      currentPassword,
      newPassword: currentPassword,
      confirmPassword: currentPassword,
    }),
    SamePasswordError,
  );
  assert.equal(update.mock.callCount(), 0);
});

test('password change enforces registration policy without writing on failure', async () => {
  const { database, update } = fixture();
  for (const newPassword of ['short1@', 'NoDigitsHere@', 'NoSymbol123']) {
    await assert.rejects(
      changeAdminPassword(database, 'admin-1', {
        currentPassword,
        newPassword,
        confirmPassword: newPassword,
      }),
      AdminValidationError,
    );
  }
  assert.equal(update.mock.callCount(), 0);
});

test('password change propagates lookup and update failures', async () => {
  const failure = new Error('Database unavailable');
  for (const failingOperation of ['findUnique', 'update'] as const) {
    const fixtureData = fixture();
    fixtureData[failingOperation].mock.mockImplementation(async () => {
      throw failure;
    });
    await assert.rejects(
      changeAdminPassword(fixtureData.database, 'admin-1', validChange),
      (error: unknown) => error === failure,
    );
  }
});
