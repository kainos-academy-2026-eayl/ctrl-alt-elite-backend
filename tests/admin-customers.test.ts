import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { hash, verify } from 'argon2';
import { createApp } from '../src/app';
import { createAuthorization } from '../src/authorization';
import type { PrismaClient } from '../src/generated/prisma/client';

const secret = 'test-only-secret-with-at-least-32-bytes';
const oldPassword = 'Customer123@';
const newPassword = 'NewCustomer456@';

function fixture(adminRole = 'ADMIN') {
  const records = new Map([
    [
      'admin-1',
      {
        id: 'admin-1',
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@elite.com',
        role: adminRole,
        passwordHash: 'unused',
        createdAt: new Date('2026-10-20T00:00:00Z'),
      },
    ],
    [
      'customer-1',
      {
        id: 'customer-1',
        firstName: 'Old',
        lastName: 'Customer',
        email: 'customer@elite.com',
        role: 'CUSTOMER',
        passwordHash: '',
        createdAt: new Date('2026-10-21T00:00:00Z'),
      },
    ],
  ]);
  const customer = records.get('customer-1');
  if (!customer) throw new Error('Customer fixture was not initialized.');

  const database = {
    user: {
      findUnique: async (query: {
        where: { id?: string; email?: string };
        select?: Record<string, boolean>;
      }) => {
        const record = query.where.id
          ? records.get(query.where.id)
          : [...records.values()].find(
              (user) => user.email === query.where.email,
            );
        if (!record) return null;
        if (query.select?.role && Object.keys(query.select).length === 1) {
          return { role: record.role };
        }
        if (query.select?.passwordHash) {
          return { passwordHash: record.passwordHash };
        }
        if (query.select?.id && Object.keys(query.select).length === 1) {
          return { id: record.id };
        }
        return record;
      },
      findFirst: async (query: {
        where: { id: { not: string }; email: { equals: string } };
      }) =>
        [...records.values()].find(
          (user) =>
            user.id !== query.where.id.not &&
            user.email.toLowerCase() === query.where.email.equals.toLowerCase(),
        ) ?? null,
      update: async (query: {
        where: { id: string };
        data: {
          firstName?: string;
          lastName?: string;
          email?: string;
          passwordHash?: string;
        };
        select?: Record<string, boolean>;
      }) => {
        const record = records.get(query.where.id);
        if (!record) throw new Error('record unexpectedly missing');
        Object.assign(record, query.data);
        return record;
      },
    },
  } as unknown as PrismaClient;
  return { database, records, customer };
}

async function serve(
  context: { after: (cleanup: () => Promise<void>) => void },
  database: PrismaClient,
  tokenRoleUserId = 'admin-1',
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
    tokenRoleUserId,
  );
  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    token,
    request: (
      path: string,
      method = 'GET',
      body?: unknown,
      bearer: string | null = token,
    ) =>
      fetch(`${base}${path}`, {
        method,
        headers: {
          ...(bearer === null ? {} : { authorization: `Bearer ${bearer}` }),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
  };
}

test('PUT customer updates customer fields and matches the follow-up GET shape', async (context) => {
  const { database, customer } = fixture();
  const api = await serve(context, database);
  const response = await api.request('/api/admin/customers/customer-1', 'PUT', {
    firstName: '  Grace ',
    lastName: ' Hopper  ',
    email: ' GRACE@EXAMPLE.COM ',
    id: 'admin-1',
    role: 'ADMIN',
    password: 'must-not-be-used',
    registrationDate: '1900-01-01',
  });
  assert.equal(response.status, 200);
  const expected = {
    id: 'customer-1',
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    registrationDate: '2026-10-21',
  };
  assert.deepEqual(await response.json(), { customer: expected });
  assert.deepEqual(
    await (await api.request('/api/admin/customers/customer-1')).json(),
    { customer: expected },
  );
  assert.equal(customer.role, 'CUSTOMER');
  assert.equal(customer.passwordHash, '');
});

test('PUT customer allows an empty optional last name and unchanged own email', async (context) => {
  const { database } = fixture();
  const api = await serve(context, database);
  const response = await api.request('/api/admin/customers/customer-1', 'PUT', {
    firstName: 'Single',
    lastName: '   ',
    email: ' CUSTOMER@ELITE.COM ',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    customer: {
      id: 'customer-1',
      firstName: 'Single',
      lastName: '',
      email: 'customer@elite.com',
      registrationDate: '2026-10-21',
    },
  });
});

test('PUT customer rejects invalid details and case-insensitive duplicate emails', async (context) => {
  const { database, customer } = fixture();
  const api = await serve(context, database);
  const cases = [
    [
      { lastName: 'Hopper', email: 'grace@example.com' },
      'First name is required.',
    ],
    [
      { firstName: '  ', lastName: 'Hopper', email: 'grace@example.com' },
      'First name is required.',
    ],
    [
      { firstName: 'A'.repeat(101), email: 'grace@example.com' },
      'First name must be 100 characters or fewer.',
    ],
    [
      {
        firstName: 'Grace',
        lastName: 'B'.repeat(101),
        email: 'grace@example.com',
      },
      'Last name must be 100 characters or fewer.',
    ],
    [
      { firstName: 'Grace', lastName: 'Hopper', email: 'not-an-email' },
      'Enter a valid email address.',
    ],
    [
      {
        firstName: 'Grace',
        lastName: 'Hopper',
        email: `${'x'.repeat(250)}@x.com`,
      },
      'Enter a valid email address.',
    ],
  ] as const;
  for (const [body, message] of cases) {
    const response = await api.request(
      '/api/admin/customers/customer-1',
      'PUT',
      body,
    );
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message });
    assert.equal(
      response.headers.get('content-type')?.includes('application/json'),
      true,
    );
  }

  const duplicate = await api.request(
    '/api/admin/customers/customer-1',
    'PUT',
    {
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'ADMIN@ELITE.COM',
    },
  );
  assert.equal(duplicate.status, 409);
  assert.deepEqual(await duplicate.json(), {
    message: 'Email is already in use.',
  });
  assert.equal(customer.firstName, 'Old');
});

test('PUT customer returns 404 for an unknown customer id', async (context) => {
  const { database } = fixture();
  const api = await serve(context, database);
  const response = await api.request('/api/admin/customers/missing', 'PUT', {
    firstName: 'Grace',
    email: 'grace@example.com',
  });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { message: 'Customer not found.' });
});

test('customer management endpoints enforce admin authorization', async (context) => {
  const { database } = fixture();
  const api = await serve(context, database);
  for (const [path, method, body] of [
    [
      '/api/admin/customers/customer-1',
      'PUT',
      { firstName: 'Grace', email: 'grace@example.com' },
    ],
    [
      '/api/admin/customers/customer-1/password',
      'PUT',
      { newPassword, confirmPassword: newPassword },
    ],
  ] as const) {
    const missing = await api.request(path, method, body, null);
    assert.equal(missing.status, 401);
    const invalid = await api.request(path, method, body, 'invalid-token');
    assert.equal(invalid.status, 401);
  }

  const { database: customerDatabase } = fixture('CUSTOMER');
  const customerApi = await serve(context, customerDatabase);
  for (const path of [
    '/api/admin/customers/customer-1',
    '/api/admin/customers/customer-1/password',
  ]) {
    const response = await customerApi.request(
      path,
      'PUT',
      path.endsWith('/password')
        ? { newPassword, confirmPassword: newPassword }
        : { firstName: 'Grace', email: 'grace@example.com' },
    );
    assert.equal(response.status, 403);
  }
});

test('PUT customer password resets the hash and the customer can log in only with the new password', async (context) => {
  const { database, customer } = fixture();
  customer.passwordHash = await hash(oldPassword);
  const api = await serve(context, database);
  const response = await api.request(
    '/api/admin/customers/customer-1/password',
    'PUT',
    { newPassword, confirmPassword: newPassword },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    message: 'Password reset successfully.',
  });
  assert.notEqual(customer.passwordHash, newPassword);
  assert.ok(await verify(customer.passwordHash, newPassword));

  const oldLogin = await api.request('/api/auth/login', 'POST', {
    email: customer.email,
    password: oldPassword,
  });
  assert.equal(oldLogin.status, 401);
  const newLogin = await api.request('/api/auth/login', 'POST', {
    email: customer.email,
    password: newPassword,
  });
  assert.equal(newLogin.status, 200);
});

test('PUT customer password validates mismatch, policy and unknown ids', async (context) => {
  const { database, customer } = fixture();
  customer.passwordHash = await hash(oldPassword);
  const api = await serve(context, database);
  const cases = [
    [
      { newPassword, confirmPassword: 'Different123@' },
      'The new password and confirmation do not match.',
    ],
    [
      { newPassword: 'short1@', confirmPassword: 'short1@' },
      'Use 8 to 128 characters, including a digit and one of: @, £, $, %, &.',
    ],
    [
      { newPassword, confirmPassword: '' },
      'New password and confirmation are required.',
    ],
    [{ newPassword }, 'New password and confirmation are required.'],
  ] as const;
  for (const [body, message] of cases) {
    const response = await api.request(
      '/api/admin/customers/customer-1/password',
      'PUT',
      body,
    );
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message });
  }
  assert.ok(await verify(customer.passwordHash, oldPassword));

  const unknown = await api.request(
    '/api/admin/customers/missing/password',
    'PUT',
    { newPassword, confirmPassword: newPassword },
  );
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), { message: 'Customer not found.' });
});
