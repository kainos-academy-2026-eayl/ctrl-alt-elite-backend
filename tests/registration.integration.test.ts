import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { test } from 'node:test'
import { verify } from 'argon2'
import { createApp } from '../src/app'
import { createDatabase } from '../src/database'

test('registration API persists users securely and handles invalid requests', {
  skip:
    process.env.RUN_DB_TESTS !== '1'
      ? 'Set RUN_DB_TESTS=1 with PostgreSQL running'
      : false,
}, async (t) => {
  const database = createDatabase()
  const email = `registration-test-${randomUUID()}@example.com`
  const origin = 'http://localhost:5500'
  const server = createApp(database, origin).listen(0, '127.0.0.1')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
    try {
      await database.user.deleteMany({ where: { email } })
    } finally {
      await database.$disconnect()
    }
  })
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const registration = {
    firstName: 'Test',
    lastName: 'User',
    email: email.toUpperCase(),
    password: 'Password1@',
    confirmPassword: 'Password1@',
  }
  const post = (body: unknown) =>
    fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(body),
    })

  const health = await fetch(`${baseUrl}/health`)
  assert.equal(health.status, 200)
  assert.equal((await health.json()).status, 'ok')

  const preflight = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin)

  const response = await post(registration)
  assert.equal(response.status, 201)
  assert.equal(response.headers.get('access-control-allow-origin'), origin)
  const result = await response.json()
  assert.deepEqual(Object.keys(result), ['user'])
  assert.deepEqual(Object.keys(result.user).sort(), [
    'createdAt',
    'email',
    'firstName',
    'id',
    'lastName',
  ])
  assert.equal(result.user.email, email)
  const stored = await database.user.findUniqueOrThrow({ where: { email } })
  assert.notEqual(stored.passwordHash, registration.password)
  assert.ok(await verify(stored.passwordHash, registration.password))
  assert.equal(result.user.id, stored.id)

  const duplicate = await post({ ...registration, email })
  assert.equal(duplicate.status, 409)
  assert.equal(
    (await duplicate.json()).message,
    'An account with this email already exists.',
  )
  assert.equal(
    (await post({ ...registration, confirmPassword: 'wrong' })).status,
    400,
  )
  assert.equal((await post({ ...registration, password: 'weak' })).status, 400)
  assert.equal(await database.user.count({ where: { email } }), 1)

  const malformed = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  })
  assert.equal(malformed.status, 400)
  assert.equal(
    (await malformed.json()).message,
    'Request body must contain valid JSON.',
  )
  const unsupported = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    body: 'hello',
  })
  assert.equal(unsupported.status, 415)
  const oversized = await post({
    ...registration,
    firstName: 'a'.repeat(17000),
  })
  assert.equal(oversized.status, 413)
})
