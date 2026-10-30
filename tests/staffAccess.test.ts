import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createAuthorization } from '../src/middleware/authorization_middleware';

const secret = 'test-only-secret-with-at-least-32-bytes';

async function fixture() {
  const state = { role: 'CUSTOMER_SERVICE' };
  const user = {
    findUnique: async (query: { select?: { role?: boolean } }) =>
      query.select?.role === true && Object.keys(query.select).length === 1
        ? { role: state.role }
        : {
            id: 'staff-1',
            firstName: 'Sam',
            lastName: 'Support',
            email: 'sam@company.com',
            role: state.role,
          },
    findMany: async () => [],
    count: async () => 0,
    findFirst: async () => null,
  };
  const supportTicket = { findMany: async () => [] };
  const database = {
    user,
    supportTicket,
    $transaction: async (queries: unknown[]) => Promise.all(queries),
  } as unknown as PrismaClient;
  const { issueToken } = createAuthorization(database, secret);
  return {
    state,
    app: createApp(database, 'http://localhost:5500', secret),
    token: await issueToken('staff-1'),
  };
}

test('customer service can use the admin access check and profile', async () => {
  const { app, token } = await fixture();
  const check = await request(app)
    .get('/api/admin/customers?pageSize=1')
    .auth(token, { type: 'bearer' });
  assert.equal(check.status, 200);

  const profile = await request(app)
    .get('/api/admin/profile')
    .auth(token, { type: 'bearer' });
  assert.equal(profile.status, 200);
  assert.deepEqual(
    {
      name: profile.body.name,
      email: profile.body.email,
      role: profile.body.role,
    },
    { name: 'Sam Support', email: 'sam@company.com', role: 'CUSTOMER_SERVICE' },
  );
});

test('customer service can list admin support tickets', async () => {
  const { app, token } = await fixture();
  const response = await request(app)
    .get('/api/admin/support/tickets')
    .auth(token, { type: 'bearer' });
  assert.equal(response.status, 200);
});

test('customer service is denied customer writes and other admin endpoints', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { app, token } = await fixture();
  const attempts = [
    request(app).put('/api/admin/customers/c-1').send({}),
    request(app).put('/api/admin/customers/c-1/password').send({}),
    request(app).get('/api/admin/reports'),
    request(app).get('/api/admin/products'),
    request(app).post('/api/admin/products').send({}),
  ];
  for (const attempt of attempts) {
    const response = await attempt.auth(token, { type: 'bearer' });
    assert.equal(response.status, 403);
  }
});

test('a role change applies on the next request', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { app, state, token } = await fixture();
  const get = () =>
    request(app).get('/api/admin/profile').auth(token, { type: 'bearer' });
  assert.equal((await get()).status, 200);
  state.role = 'CUSTOMER';
  assert.equal((await get()).status, 403);
  state.role = 'ADMIN';
  assert.equal((await get()).body.role, 'ADMIN');
});

test('requests without a token are rejected with 401', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { app } = await fixture();
  assert.equal((await request(app).get('/api/admin/profile')).status, 401);
  assert.equal((await request(app).get('/api/admin/reports')).status, 401);
});
