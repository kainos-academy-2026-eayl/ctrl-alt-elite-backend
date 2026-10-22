import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { before, test } from 'node:test';
import { hash } from 'argon2';
import { SignJWT } from 'jose';
import { createApp } from '../src/app';
import { createAuthorization } from '../src/authorization';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client';

const secret = 'test-only-secret-with-at-least-32-bytes';
let passwordHash: string;
before(async () => {
  passwordHash = await hash('Password123');
});

function fixture() {
  const state: { role: unknown; exists: boolean; failure?: Error } = {
    role: 'ADMIN',
    exists: true,
  };
  const record = {
    id: 'user-1',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    createdAt: new Date('2026-10-20T00:00:00Z'),
  };
  const calls = { authorization: 0, resources: 0, login: 0 };
  const database = {
    user: {
      findUnique: async (query: {
        where: { id?: string; email?: string };
        select?: { role?: boolean };
      }) => {
        if (query.where.email) {
          calls.login++;
          return { ...record, passwordHash, role: state.role };
        }
        if (query.select?.role) {
          calls.authorization++;
          assert.deepEqual(query.where, { id: 'user-1' });
          if (state.failure) throw state.failure;
          return state.exists ? { role: state.role } : null;
        }
        calls.resources++;
        return record;
      },
      findMany: async () => {
        calls.resources++;
        return [record];
      },
      count: async () => 1,
    },
  } as unknown as PrismaClient;
  return { state, calls, database };
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
  return `http://127.0.0.1:${port}`;
}

const protectedPaths = [
  '/api/admin/customers',
  '/api/admin/customers/user-1',
  '/api/customers',
  '/api/customers/user-1',
];

test('login issues a token that grants ADMIN access to both customer URL forms', async (context) => {
  const { database, calls } = fixture();
  const base = await serve(context, database);
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'Password123',
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(
    body &&
      typeof body === 'object' &&
      'userId' in body &&
      'role' in body &&
      'token' in body,
  );
  assert.equal(body.userId, 'user-1');
  assert.equal(body.role, 'ADMIN');
  assert.equal(typeof body.token, 'string');
  assert.deepEqual(Object.keys(body).sort(), [
    'email',
    'role',
    'token',
    'userId',
  ]);
  for (const path of protectedPaths) {
    const resource = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${body.token}` },
    });
    assert.equal(resource.status, 200);
    const data = await resource.json();
    assert.ok(data && typeof data === 'object');
    assert.ok(
      path.endsWith('user-1') ? 'customer' in data : 'customers' in data,
    );
  }
  assert.equal(calls.authorization, 4);
  assert.equal(calls.resources, 4);
});

test('customers and missing or unsupported roles are denied before resource access', async (context) => {
  const { database, state, calls } = fixture();
  const logger = context.mock.method(console, 'warn', () => {});
  const base = await serve(context, database);
  const token = await createAuthorization(database, secret).issueToken(
    'user-1',
  );
  for (const role of ['CUSTOMER', null, undefined, 'SUPERUSER']) {
    state.role = role;
    for (const path of protectedPaths) {
      const response = await fetch(`${base}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        message: 'Access denied. Administrator privileges required.',
      });
    }
  }
  assert.equal(calls.resources, 0);
  assert.equal(logger.mock.callCount(), 16);
});

test('unauthenticated and forged requests cannot reach any admin namespace method', async (context) => {
  const { database, calls } = fixture();
  const logger = context.mock.method(console, 'warn', () => {});
  const base = await serve(context, database);
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    for (const path of [
      ...protectedPaths,
      '/api/admin/orders',
      '/api/admin/products',
      '/api/admin/products/1',
    ]) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { 'X-User-Role': 'ADMIN', 'X-User-Id': 'user-1' },
      });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('www-authenticate'), 'Bearer');
    }
  }
  assert.equal(calls.authorization, 0);
  assert.equal(calls.resources, 0);
  assert.equal(logger.mock.callCount(), 28);
});

test('rejects invalid tokens, signatures, expiry, claims and algorithms', async (context) => {
  const { database, calls } = fixture();
  const logger = context.mock.method(console, 'warn', () => {});
  const base = await serve(context, database);
  const key = new TextEncoder().encode(secret);
  const signed = (
    claims: Record<string, unknown> = {},
    algorithm = 'HS256',
    signingKey = key,
  ) =>
    new SignJWT({
      sub: 'user-1',
      iss: 'ctrl-alt-elite-backend',
      aud: 'ctrl-alt-elite-api',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...claims,
    })
      .setProtectedHeader({ alg: algorithm })
      .sign(signingKey);
  const valid = await signed();
  const headers = [
    'Basic credentials',
    'Bearer',
    'Bearer not-a-jwt',
    `Bearer ${valid} extra`,
    `Bearer ${await signed({}, 'HS256', new TextEncoder().encode('different-test-key-with-at-least-32-bytes'))}`,
    `Bearer ${await signed({ exp: 1 })}`,
    `Bearer ${await signed({ nbf: Math.floor(Date.now() / 1000) + 3600 })}`,
    `Bearer ${await signed({ iss: 'other-issuer' })}`,
    `Bearer ${await signed({ aud: 'other-audience' })}`,
    `Bearer ${await signed({ sub: '' })}`,
    `Bearer ${await signed({ sub: undefined })}`,
    `Bearer ${await signed({ exp: undefined })}`,
    `Bearer ${await signed({ iat: undefined })}`,
    `Bearer ${await signed({}, 'HS384')}`,
  ];
  for (const Authorization of headers) {
    const response = await fetch(`${base}/api/admin/customers`, {
      headers: { Authorization },
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      message: 'Authentication required.',
    });
  }
  assert.equal(calls.authorization, 0);
  assert.equal(calls.resources, 0);
  assert.equal(logger.mock.callCount(), headers.length);
});

test('rechecks the database role and rejects deleted users with an existing token', async (context) => {
  const { database, state, calls } = fixture();
  context.mock.method(console, 'warn', () => {});
  const base = await serve(context, database);
  const token = await createAuthorization(database, secret).issueToken(
    'user-1',
  );
  const request = () =>
    fetch(`${base}/api/admin/customers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  assert.equal((await request()).status, 200);
  state.role = 'CUSTOMER';
  assert.equal((await request()).status, 403);
  state.exists = false;
  assert.equal((await request()).status, 401);
  assert.equal(calls.authorization, 3);
  assert.equal(calls.resources, 1);
});

test('logs authorization failures and returns safe server errors', async (context) => {
  const { database, state, calls } = fixture();
  const logger = context.mock.method(console, 'error', () => {});
  const base = await serve(context, database);
  const token = await createAuthorization(database, secret).issueToken(
    'user-1',
  );
  for (const [failure, status, message] of [
    [
      new Error('Private database details'),
      500,
      'Unable to complete the request.',
    ],
    [
      new Prisma.PrismaClientKnownRequestError('Private connection details', {
        code: 'P1001',
        clientVersion: 'test',
      }),
      503,
      'Service temporarily unavailable.',
    ],
  ] as const) {
    state.failure = failure;
    const response = await fetch(`${base}/api/admin/customers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { message });
  }
  assert.equal(calls.resources, 0);
  assert.equal(logger.mock.callCount(), 2);
});

test('health, login failures and registration validation remain public', async (context) => {
  const { database, calls } = fixture();
  const base = await serve(context, database);
  assert.equal((await fetch(`${base}/health`)).status, 200);
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'wrong' }),
  });
  assert.equal(login.status, 401);
  assert.deepEqual(await login.json(), {
    message: 'Incorrect email or password.',
  });
  const registration = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(registration.status, 400);
  assert.equal(calls.login, 1);
  assert.equal(calls.authorization, 0);
});
