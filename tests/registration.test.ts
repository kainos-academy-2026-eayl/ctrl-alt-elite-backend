import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RegistrationValidationError,
  validateRegistration,
} from '../src/registration';

const valid = {
  firstName: ' Caolan ',
  lastName: ' Example ',
  email: ' CAOLAN@example.com ',
  password: 'Password1@',
  confirmPassword: 'Password1@',
};

test('normalises names and email without changing passwords', () => {
  assert.deepEqual(validateRegistration(valid), {
    ...valid,
    firstName: 'Caolan',
    lastName: 'Example',
    email: 'caolan@example.com',
  });
});

test('accepts exactly eight password characters and each frontend special character', () => {
  for (const character of ['@', '\u00a3', '$', '%', '&']) {
    const password = `abcdef1${character}`;
    assert.equal(
      validateRegistration({ ...valid, password, confirmPassword: password })
        .password,
      password,
    );
  }
});

test('rejects invalid fields and non-object input', () => {
  const invalid: unknown[] = [
    undefined,
    null,
    [],
    'registration',
    1,
    true,
    {},
    { ...valid, firstName: undefined },
    { ...valid, firstName: ' ' },
    { ...valid, firstName: 'a'.repeat(101) },
    { ...valid, lastName: 1 },
    { ...valid, lastName: ' ' },
    { ...valid, lastName: 'a'.repeat(101) },
    { ...valid, email: undefined },
    { ...valid, email: 1 },
    { ...valid, email: 'not-an-email' },
    { ...valid, email: `${'a'.repeat(250)}@example.com` },
    { ...valid, password: undefined },
    { ...valid, password: 1 },
    { ...valid, password: 'abcde1@', confirmPassword: 'abcde1@' },
    { ...valid, password: 'Password@', confirmPassword: 'Password@' },
    { ...valid, password: 'Password1!', confirmPassword: 'Password1!' },
    { ...valid, password: `A1@${'a'.repeat(126)}` },
    { ...valid, confirmPassword: undefined },
    { ...valid, confirmPassword: 1 },
    { ...valid, confirmPassword: 'different' },
  ];
  for (const input of invalid) {
    assert.throws(
      () => validateRegistration(input),
      RegistrationValidationError,
    );
  }
});

test('accepts exact maximum lengths after trimming names and email', () => {
  const name = 'a'.repeat(100);
  const email = `${'a'.repeat(242)}@example.com`;
  const password = `A1@${'a'.repeat(125)}`;
  assert.deepEqual(
    validateRegistration({
      firstName: ` ${name} `,
      lastName: ` ${name} `,
      email: ` ${email} `,
      password,
      confirmPassword: password,
    }),
    {
      firstName: name,
      lastName: name,
      email,
      password,
      confirmPassword: password,
    },
  );
  assert.throws(
    () => validateRegistration({ ...valid, email: `a${email}` }),
    RegistrationValidationError,
  );
});

test('preserves the existing email pattern and strips unknown fields', () => {
  assert.deepEqual(
    validateRegistration({ ...valid, email: ' A@B.C ', role: 'admin' }),
    {
      ...valid,
      firstName: 'Caolan',
      lastName: 'Example',
      email: 'a@b.c',
    },
  );
});

test('preserves whitespace in passwords', () => {
  const password = ' Password1@ ';
  const registration = validateRegistration({
    ...valid,
    password,
    confirmPassword: password,
  });
  assert.equal(registration.password, password);
  assert.equal(registration.confirmPassword, password);
});

test('preserves validation messages and first-error precedence', () => {
  const cases = [
    {
      input: null,
      message:
        'Invalid details - check firstName, lastName, email or password provided.',
    },
    {
      input: {},
      message:
        'First and last names are required and must be at most 100 characters.',
    },
    {
      input: { ...valid, lastName: ' ', email: 1 },
      message:
        'First and last names are required and must be at most 100 characters.',
    },
    {
      input: { ...valid, email: 1, password: 'weak' },
      message: 'Please enter a valid email address.',
    },
    {
      input: { ...valid, password: 'weak', confirmPassword: undefined },
      message:
        'Use 8 to 128 characters, including a digit and one of: @, \u00a3, $, %, &.',
    },
    {
      input: { ...valid, confirmPassword: 'different' },
      message: 'Passwords do not match.',
    },
    {
      input: { ...valid, confirmPassword: undefined },
      message: 'Passwords do not match.',
    },
  ];
  for (const { input, message } of cases) {
    assert.throws(() => validateRegistration(input), {
      name: 'Error',
      message,
    });
  }
});
