import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { Request, Response } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createAuthorization } from '../src/middleware/authorization_middleware';

const secret = 'test-only-secret-with-at-least-32-bytes';
const database = {} as PrismaClient;

test('rejects missing or short signing secrets', () => {
  for (const value of ['', 'too-short']) {
    assert.throws(() => createAuthorization(database, value), {
      message: 'JWT_SECRET must contain at least 32 bytes.',
    });
  }
});

test('issues a signed identity token valid for one hour', async () => {
  const { issueToken } = createAuthorization(database, secret);
  const token = await issueToken('admin-1');
  const { payload, protectedHeader } = await jwtVerify(
    token,
    new TextEncoder().encode(secret),
    {
      algorithms: ['HS256'],
      issuer: 'ctrl-alt-elite-backend',
      audience: 'ctrl-alt-elite-api',
    },
  );
  assert.equal(protectedHeader.alg, 'HS256');
  assert.equal(payload.sub, 'admin-1');
  assert.equal(typeof payload.iat, 'number');
  assert.equal(typeof payload.exp, 'number');
  assert.equal(Number(payload.exp) - Number(payload.iat), 3600);
  assert.equal(payload.role, undefined);
});

function fixture() {
  const state: { role: unknown; exists: boolean; failure?: Error } = {
    role: 'ADMIN',
    exists: true,
  };
  const findUnique = mock.fn(async (_query: unknown) => {
    if (state.failure) throw state.failure;
    return state.exists ? { role: state.role } : null;
  });
  const database = { user: { findUnique } } as unknown as PrismaClient;
  const authorization = createAuthorization(database, secret);
  return { state, findUnique, ...authorization };
}

async function invoke(
  requireAdmin: ReturnType<typeof createAuthorization>['requireAdmin'],
  authorization?: string,
) {
  const request = {
    get: mock.fn((name: string) =>
      name.toLowerCase() === 'authorization' ? authorization : undefined,
    ),
  } as unknown as Request;
  const locals: Record<string, unknown> = {};
  const response = {
    locals,
    setHeader: mock.fn(),
    status: mock.fn((_status: number) => response),
    json: mock.fn((_body: unknown) => response),
  };
  const next = mock.fn();
  await requireAdmin(request, response as unknown as Response, next);
  return { response, next };
}

test('requireAdmin permits an admin and exposes only the verified token subject', async () => {
  const { requireAdmin, issueToken, findUnique } = fixture();
  const token = await issueToken('admin-1');
  const { response, next } = await invoke(requireAdmin, `Bearer ${token}`);
  assert.deepEqual(findUnique.mock.calls[0]?.arguments, [
    { where: { id: 'admin-1' }, select: { role: true } },
  ]);
  assert.deepEqual(response.locals, { userId: 'admin-1' });
  assert.equal(next.mock.callCount(), 1);
  assert.deepEqual(next.mock.calls[0]?.arguments, []);
  assert.equal(response.status.mock.callCount(), 0);
});

test('requireAdmin rejects missing and malformed authentication without accessing the database', async (context) => {
  const logger = context.mock.method(console, 'warn', () => {});
  const { requireAdmin, issueToken, findUnique } = fixture();
  const token = await issueToken('admin-1');
  for (const header of [
    undefined,
    'Basic credentials',
    'Bearer',
    'Bearer invalid-token',
    `Bearer ${token} extra`,
  ]) {
    const { response, next } = await invoke(requireAdmin, header);
    assert.deepEqual(response.status.mock.calls[0]?.arguments, [401]);
    assert.deepEqual(response.json.mock.calls[0]?.arguments, [
      { message: 'Authentication required.' },
    ]);
    assert.deepEqual(response.setHeader.mock.calls[0]?.arguments, [
      'WWW-Authenticate',
      'Bearer',
    ]);
    assert.deepEqual(response.locals, {});
    assert.equal(next.mock.callCount(), 0);
  }
  assert.equal(findUnique.mock.callCount(), 0);
  assert.equal(logger.mock.callCount(), 5);
});

test('requireAdmin rejects invalid signatures, expiry, claims and algorithms', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { requireAdmin, findUnique } = fixture();
  const key = new TextEncoder().encode(secret);
  const signed = (
    claims: Record<string, unknown> = {},
    algorithm = 'HS256',
    signingKey = key,
  ) =>
    new SignJWT({
      sub: 'admin-1',
      iss: 'ctrl-alt-elite-backend',
      aud: 'ctrl-alt-elite-api',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...claims,
    })
      .setProtectedHeader({ alg: algorithm })
      .sign(signingKey);
  const tokens = [
    await signed(
      {},
      'HS256',
      new TextEncoder().encode('different-key-with-at-least-32-bytes'),
    ),
    await signed({ exp: 1 }),
    await signed({ nbf: Math.floor(Date.now() / 1000) + 3600 }),
    await signed({ iss: 'other-issuer' }),
    await signed({ aud: 'other-audience' }),
    await signed({ sub: '' }),
    await signed({ sub: undefined }),
    await signed({ exp: undefined }),
    await signed({ iat: undefined }),
    await signed({}, 'HS384'),
  ];
  for (const token of tokens) {
    const { response, next } = await invoke(requireAdmin, `Bearer ${token}`);
    assert.deepEqual(response.status.mock.calls[0]?.arguments, [401]);
    assert.deepEqual(response.json.mock.calls[0]?.arguments, [
      { message: 'Authentication required.' },
    ]);
    assert.equal(next.mock.callCount(), 0);
  }
  assert.equal(findUnique.mock.callCount(), 0);
});

test('requireAdmin denies non-admin and unsupported roles without continuing', async (context) => {
  const logger = context.mock.method(console, 'warn', () => {});
  const { state, requireAdmin, issueToken } = fixture();
  const token = await issueToken('admin-1');
  for (const role of ['CUSTOMER', null, undefined, 'SUPERUSER']) {
    state.role = role;
    const { response, next } = await invoke(requireAdmin, `Bearer ${token}`);
    assert.deepEqual(response.status.mock.calls[0]?.arguments, [403]);
    assert.deepEqual(response.json.mock.calls[0]?.arguments, [
      { message: 'Access denied. Administrator privileges required.' },
    ]);
    assert.deepEqual(response.locals, {});
    assert.equal(next.mock.callCount(), 0);
  }
  assert.equal(logger.mock.callCount(), 4);
});

test('requireAdmin rechecks the role and rejects deleted users with an existing token', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { state, requireAdmin, issueToken, findUnique } = fixture();
  const token = await issueToken('admin-1');
  assert.equal(
    (await invoke(requireAdmin, `Bearer ${token}`)).next.mock.callCount(),
    1,
  );
  state.role = 'CUSTOMER';
  const denied = await invoke(requireAdmin, `Bearer ${token}`);
  assert.deepEqual(denied.response.status.mock.calls[0]?.arguments, [403]);
  state.exists = false;
  const deleted = await invoke(requireAdmin, `Bearer ${token}`);
  assert.deepEqual(deleted.response.status.mock.calls[0]?.arguments, [401]);
  assert.deepEqual(deleted.response.json.mock.calls[0]?.arguments, [
    { message: 'Authentication required.' },
  ]);
  assert.equal(deleted.next.mock.callCount(), 0);
  assert.equal(findUnique.mock.callCount(), 3);
});

test('requireAdmin propagates database failures to the caller', async () => {
  const { state, requireAdmin, issueToken } = fixture();
  const token = await issueToken('admin-1');
  const failure = new Error('Private database details');
  state.failure = failure;
  await assert.rejects(
    invoke(requireAdmin, `Bearer ${token}`),
    (error: unknown) => error === failure,
  );
});
