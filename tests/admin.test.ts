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
    duplicateEmail: false,
    record: {
      id: 'admin-1',
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@elite.com',
      role,
      createdAt: new Date('2026-10-20T00:00:00Z'),
    },
  };
  const database = {
    user: {
      findUnique: async (query: {
        where: { id: string };
        select: Record<string, boolean>;
      }) => {
        assert.equal(query.where.id, 'admin-1');
        if (state.failure) throw state.failure;
        if (query.select.role && Object.keys(query.select).length === 1) {
          return { role: state.record.role };
        }
        if (query.select.passwordHash) {
          return { passwordHash: state.passwordHash };
        }
        return state.record;
      },
      findFirst: async (query: {
        where: { id: { not: string }; email: { equals: string; mode: string } };
      }) => {
        assert.equal(query.where.id.not, 'admin-1');
        assert.equal(query.where.email.mode, 'insensitive');
        const duplicate =
          state.duplicateEmail ||
          (state.record.email.toLowerCase() !==
            query.where.email.equals.toLowerCase() &&
            query.where.email.equals.toLowerCase() === 'existing@elite.com');
        return duplicate ? { id: 'other-user' } : null;
      },
      update: async (query: {
        where: { id: string };
        data: {
          firstName?: string;
          lastName?: string;
          email?: string;
          passwordHash?: string;
        };
      }) => {
        assert.equal(query.where.id, 'admin-1');
        state.updates++;
        if (query.data.passwordHash) {
          state.passwordHash = query.data.passwordHash;
        }
        if (query.data.firstName !== undefined) {
          state.record.firstName = query.data.firstName;
        }
        if (query.data.lastName !== undefined) {
          state.record.lastName = query.data.lastName;
        }
        if (query.data.email !== undefined) {
          state.record.email = query.data.email;
        }
        return state.record;
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
  assert.equal(
    response.headers.get('content-type')?.includes('application/json'),
    true,
  );
});

test('all profile and change-password routes require authentication and the ADMIN role', async (context) => {
  const anonymous = await serve(context, fixture().database);
  assert.equal((await anonymous.get('/api/admin/profile', null)).status, 401);
  assert.equal(
    (await anonymous.get('/api/admin/profile', 'invalid-token')).status,
    401,
  );
  assert.equal(
    (
      await anonymous.put(
        '/api/admin/profile',
        { name: 'Grace Hopper', email: 'grace@elite.com' },
        null,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await anonymous.put(
        '/api/admin/profile',
        { name: 'Grace Hopper', email: 'grace@elite.com' },
        'invalid-token',
      )
    ).status,
    401,
  );
  assert.equal(
    (await anonymous.put('/api/admin/change-password', validChange, null))
      .status,
    401,
  );

  const customer = await serve(context, fixture('CUSTOMER').database);
  assert.equal((await customer.get('/api/admin/profile')).status, 403);
  assert.equal(
    (
      await customer.put('/api/admin/profile', {
        name: 'Grace Hopper',
        email: 'grace@elite.com',
      })
    ).status,
    403,
  );
  assert.equal(
    (await customer.put('/api/admin/change-password', validChange)).status,
    403,
  );
});

test('PUT /api/admin/profile updates the signed-in admin and customer details', async (context) => {
  const { database, state } = fixture();
  const api = await serve(context, database);
  const response = await api.put('/api/admin/profile', {
    name: ' Grace Hopper ',
    email: ' GRACE@ELITE.COM ',
    id: 'another-user',
    role: 'CUSTOMER',
    password: 'do-not-store',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: 'admin-1',
    name: 'Grace Hopper',
    email: 'grace@elite.com',
    role: 'ADMIN',
  });
  assert.equal(state.record.firstName, 'Grace');
  assert.equal(state.record.lastName, 'Hopper');
  assert.equal(state.record.email, 'grace@elite.com');
  assert.equal(state.record.role, 'ADMIN');
  const customerResponse = await api.get('/api/admin/customers/admin-1');
  assert.deepEqual(await customerResponse.json(), {
    customer: {
      id: 'admin-1',
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@elite.com',
      registrationDate: '2026-10-20',
    },
  });
});

test('profile update allows one-word names and the admin keeping their own email', async (context) => {
  const { database, state } = fixture();
  const api = await serve(context, database);
  const response = await api.put('/api/admin/profile', {
    name: '  Grace  ',
    email: ' ADMIN@ELITE.COM ',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: 'admin-1',
    name: 'Grace',
    email: 'admin@elite.com',
    role: 'ADMIN',
  });
  assert.equal(state.record.firstName, 'Grace');
  assert.equal(state.record.lastName, '');
});

test('profile update rejects case-insensitive duplicate email addresses', async (context) => {
  const { database, state } = fixture();
  state.duplicateEmail = true;
  const api = await serve(context, database);
  const response = await api.put('/api/admin/profile', {
    name: 'Grace Hopper',
    email: 'EXISTING@ELITE.COM',
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    message: 'Email is already in use.',
  });
  assert.equal(state.updates, 0);
});

test('profile update returns user-friendly validation errors and ignores extra fields', async (context) => {
  const { database, state } = fixture();
  const api = await serve(context, database);
  const cases = [
    [{ email: 'grace@elite.com' }, 'Name is required.'],
    [{ name: '   ', email: 'grace@elite.com' }, 'Name is required.'],
    [
      { name: 'A'.repeat(101), email: 'grace@elite.com' },
      'Name must be 100 characters or fewer.',
    ],
    [{ name: 'Grace Hopper' }, 'Email address is required.'],
    [
      { name: 'Grace Hopper', email: 'not-an-email' },
      'Enter a valid email address.',
    ],
    [
      { name: 'Grace Hopper', email: `${'a'.repeat(245)}@elite.com` },
      'Enter a valid email address.',
    ],
  ] as const;
  for (const [body, message] of cases) {
    const response = await api.put('/api/admin/profile', body);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message });
    assert.equal(
      response.headers.get('content-type')?.includes('application/json'),
      true,
    );
  }
  assert.equal(state.updates, 0);
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
  assert.equal(await verify(state.passwordHash, currentPassword), false);
  assert.equal(
    response.headers.get('content-type')?.includes('application/json'),
    true,
  );
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
      'The new password and confirmation do not match.',
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
    [
      { ...validChange, currentPassword: '' },
      'All password fields are required.',
    ],
    [
      {
        newPassword: validChange.newPassword,
        confirmPassword: validChange.confirmPassword,
      },
      'All password fields are required.',
    ],
  ] as const;
  for (const [body, message] of cases) {
    const response = await api.put('/api/admin/change-password', body);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message });
  }
  assert.equal(state.updates, 0);
});

test('rejects a new password that is the same as the current password', async (context) => {
  const { database, state } = fixture();
  const api = await serve(context, database);
  const response = await api.put('/api/admin/change-password', {
    currentPassword,
    newPassword: currentPassword,
    confirmPassword: currentPassword,
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    message: 'New password must be different from your current password.',
  });
  assert.equal(state.updates, 0);
  assert.equal(state.passwordHash, passwordHash);
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

test('returns a generic 500 response for unavailable databases on profile and password change', async (context) => {
  const { database, state } = fixture();
  const api = await serve(context, database);
  const initial = await api.get('/api/admin/profile');
  assert.equal(initial.status, 200);
  state.failure = new Prisma.PrismaClientKnownRequestError('down', {
    code: 'P1001',
    clientVersion: 'test',
  });
  const profileResponse = await api.get('/api/admin/profile');
  assert.equal(profileResponse.status, 500);
  assert.deepEqual(await profileResponse.json(), {
    message: 'Something went wrong.',
  });
  const passwordResponse = await api.put(
    '/api/admin/change-password',
    validChange,
  );
  assert.equal(passwordResponse.status, 500);
  assert.deepEqual(await passwordResponse.json(), {
    message: 'Something went wrong.',
  });
});
