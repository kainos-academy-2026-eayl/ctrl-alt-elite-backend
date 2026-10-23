import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { before, test } from 'node:test';
import { hash, verify } from 'argon2';
import { createApp } from '../src/app';
import { createAuthorization } from '../src/authorization';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client';

const secret = 'test-only-secret-with-at-least-32-bytes';
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

function fixture(role = 'ADMIN') {
  const state = {
    passwordHash,
    updates: 0,
    failure: undefined as Error | undefined,
  };
  const database = {
    user: {
      findUnique: async (query: {
        where: { id: string };
        select: Record<string, boolean>;
      }) => {
        assert.equal(query.where.id, 'admin-1');
        if (state.failure) throw state.failure;
        if (query.select.role && !query.select.email) return { role };
        if (query.select.passwordHash) {
          return { passwordHash: state.passwordHash };
        }
        return {
          id: 'admin-1',
          firstName: 'Admin',
          lastName: 'User',
          email: 'admin@elite.com',
          role,
        };
      },
      update: async (query: {
        where: { id: string };
        data: { passwordHash: string };
      }) => {
        assert.equal(query.where.id, 'admin-1');
        state.updates++;
        state.passwordHash = query.data.passwordHash;
      },
    },
  } as unknown as PrismaClient;
  return { state, database };
}

async function serve(
  context: { after: (cleanup: () => Promise<void>) => void },
  database: PrismaClient,
) {
  const server = createApp(database, 'http://localhost:5500', secret).listen(
    0,
    '127.0.0.1',
  );
  context.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const token = await createAuthorization(database, secret).issueToken(
    'admin-1',
  );
  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    get: (path: string, bearer: string | null = token) =>
      fetch(`${base}${path}`, {
        headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
      }),
    put: (path: string, body: unknown, bearer: string | null = token) =>
      fetch(`${base}${path}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        },
        body: JSON.stringify(body),
      }),
  };
}

test('GET /api/admin/profile returns name, email and role without secrets', async (context) => {
  const { database } = fixture();
  const api = await serve(context, database);
  const response = await api.get('/api/admin/profile');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: 'admin-1',
    name: 'Admin User',
    email: 'admin@elite.com',
    role: 'ADMIN',
  });
});

test('profile and change-password require authentication and the ADMIN role', async (context) => {
  const anonymous = await serve(context, fixture().database);
  assert.equal((await anonymous.get('/api/admin/profile', null)).status, 401);
  assert.equal(
    (await anonymous.put('/api/admin/change-password', validChange, null))
      .status,
    401,
  );

  const customer = await serve(context, fixture('CUSTOMER').database);
  assert.equal((await customer.get('/api/admin/profile')).status, 403);
  assert.equal(
    (await customer.put('/api/admin/change-password', validChange)).status,
    403,
  );
});

test('PUT /api/admin/change-password stores a new hash of the new password', async (context) => {
  const { database, state } = fixture();
  const api = await serve(context, database);
  const response = await api.put('/api/admin/change-password', validChange);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    message: 'Password updated successfully.',
  });
  assert.equal(state.updates, 1);
  assert.notEqual(state.passwordHash, validChange.newPassword);
  assert.ok(await verify(state.passwordHash, validChange.newPassword));
});

test('rejects an incorrect current password without changing it', async (context) => {
  const { database, state } = fixture();
  const api = await serve(context, database);
  const response = await api.put('/api/admin/change-password', {
    ...validChange,
    currentPassword: 'WrongPassword123',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    message: 'Current password is incorrect.',
  });
  assert.equal(state.updates, 0);
  assert.equal(state.passwordHash, passwordHash);
});

test('rejects invalid password changes without changing the password', async (context) => {
  const { database, state } = fixture();
  const api = await serve(context, database);
  const cases = [
    [
      { ...validChange, confirmPassword: 'Different1@' },
      'Passwords do not match.',
    ],
    [
      { ...validChange, newPassword: 'short1@', confirmPassword: 'short1@' },
      'Use 8 to 128 characters, including a digit and one of: @, \u00a3, $, %, &.',
    ],
    [
      {
        ...validChange,
        newPassword: 'NoDigitsHere@',
        confirmPassword: 'NoDigitsHere@',
      },
      'Use 8 to 128 characters, including a digit and one of: @, \u00a3, $, %, &.',
    ],
    [{ ...validChange, currentPassword: '' }, 'Current password is required.'],
    [
      {
        newPassword: validChange.newPassword,
        confirmPassword: validChange.confirmPassword,
      },
      'Current password is required.',
    ],
  ] as const;
  for (const [body, message] of cases) {
    const response = await api.put('/api/admin/change-password', body);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message });
  }
  assert.equal(state.updates, 0);
});

test('requires a JSON content type for password changes', async (context) => {
  const { database } = fixture();
  const api = await serve(context, database);
  const token = await createAuthorization(database, secret).issueToken(
    'admin-1',
  );
  const response = await fetch(`${api.base}/api/admin/change-password`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain' },
    body: 'x',
  });
  assert.equal(response.status, 415);
});

test('reports an unavailable database as 503 for profile and password change', async (context) => {
  const { database, state } = fixture();
  const api = await serve(context, database);
  const initial = await api.get('/api/admin/profile');
  assert.equal(initial.status, 200);
  state.failure = new Prisma.PrismaClientKnownRequestError('down', {
    code: 'P1001',
    clientVersion: 'test',
  });
  // requireAdmin also queries the database, so authorisation fails first with 503
  assert.equal((await api.get('/api/admin/profile')).status, 503);
  assert.equal(
    (await api.put('/api/admin/change-password', validChange)).status,
    503,
  );
});
