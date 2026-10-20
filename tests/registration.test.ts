import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RegistrationValidationError, validateRegistration } from '../src/registration'

const valid = {
  firstName: ' Caolan ',
  lastName: ' Example ',
  email: ' CAOLAN@example.com ',
  password: 'Password1@',
  confirmPassword: 'Password1@',
}

test('normalises names and email without changing passwords', () => {
  assert.deepEqual(validateRegistration(valid), {
    ...valid, firstName: 'Caolan', lastName: 'Example', email: 'caolan@example.com',
  })
})

test('accepts exactly eight password characters and each frontend special character', () => {
  for (const character of ['@', '\u00a3', '$', '%', '&']) {
    const password = `abcdef1${character}`
    assert.equal(validateRegistration({ ...valid, password, confirmPassword: password }).password, password)
  }
})

test('rejects invalid fields and non-object input', () => {
  const invalid: unknown[] = [
    null, [], 'registration', {},
    { ...valid, firstName: ' ' },
    { ...valid, firstName: 'a'.repeat(101) },
    { ...valid, lastName: 1 },
    { ...valid, lastName: 'a'.repeat(101) },
    { ...valid, email: 'not-an-email' },
    { ...valid, email: `${'a'.repeat(250)}@example.com` },
    { ...valid, password: 'abcde1@', confirmPassword: 'abcde1@' },
    { ...valid, password: 'Password@', confirmPassword: 'Password@' },
    { ...valid, password: 'Password1!', confirmPassword: 'Password1!' },
    { ...valid, password: `A1@${'a'.repeat(126)}` },
    { ...valid, confirmPassword: 'different' },
  ]
  for (const input of invalid) {
    assert.throws(() => validateRegistration(input), RegistrationValidationError)
  }
})
