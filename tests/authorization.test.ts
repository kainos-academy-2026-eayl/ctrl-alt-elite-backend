import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jwtVerify } from 'jose';
import { createAuthorization } from '../src/authorization';
import type { PrismaClient } from '../src/generated/prisma/client';

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
