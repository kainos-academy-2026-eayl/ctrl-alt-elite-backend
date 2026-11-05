import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { SignJWT } from 'jose';
import sharp from 'sharp';
import request from 'supertest';
import { createApp } from '../src/app';
import { ValidationError } from '../src/errors/appErrors';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client';
import { createAuthorization } from '../src/middleware/authorization_middleware';
import { supportedRoles } from '../src/models/login_model';
import {
  MAX_PROFILE_PHOTO_BYTES,
  validateOwnProfileUpdate,
} from '../src/models/profile_model';

const secret = 'profile-test-secret-with-at-least-32-bytes';

const contactFieldLimits = {
  addressLine1: 200,
  addressLine2: 200,
  town: 60,
  postcode: 20,
  phoneNumber: 30,
} as const;
const contactDetails = {
  addressLine1: '12 High Street',
  addressLine2: 'Flat 4',
  town: 'Belfast',
  postcode: 'SW1A 1AA',
  phoneNumber: '+44 (20) 7946-0958.1',
};
const invalidPhoneNumbers = [
  '020 CALL NOW',
  '020/7946/0958',
  '020_7946_0958',
  '020+7946',
  '++442079460958',
  '+ ()-.',
];

function fixture() {
  const record = {
    id: 'customer-1',
    role: 'CUSTOMER',
    firstName: 'Test',
    lastName: 'Customer',
    username: 'original' as string | null,
    profilePhoto: null as Uint8Array | null,
    passwordHash: 'never-return-this',
    email: 'private@example.com',
    addressLine1: null as string | null,
    addressLine2: null as string | null,
    town: null as string | null,
    postcode: null as string | null,
    phoneNumber: null as string | null,
  };
  const state = { exists: true, failure: null as Error | null };
  const findUnique = mock.fn(async (query: { where: { id: string } }) => {
    if (state.failure) throw state.failure;
    return state.exists && query.where.id === record.id ? record : null;
  });
  const update = mock.fn(
    async (query: {
      where: { id: string };
      data: {
        firstName?: string;
        lastName?: string;
        username?: string | null;
        profilePhoto?: Uint8Array | null;
        addressLine1?: string | null;
        addressLine2?: string | null;
        town?: string | null;
        postcode?: string | null;
        phoneNumber?: string | null;
      };
    }) => {
      if (state.failure) throw state.failure;
      assert.equal(query.where.id, record.id);
      if (query.data.username === 'taken') {
        throw new Prisma.PrismaClientKnownRequestError('Duplicate username', {
          code: 'P2002',
          clientVersion: '7',
          meta: { target: ['username'] },
        });
      }
      Object.assign(record, query.data);
      return record;
    },
  );
  const database = { user: { findUnique, update } } as unknown as PrismaClient;
  const app = createApp(database, 'http://localhost:3000', secret);
  const { issueToken } = createAuthorization(database, secret);
  return { app, record, state, findUnique, update, issueToken };
}

test('profile validation trims values, supports partial updates and clears optional usernames', () => {
  assert.deepEqual(validateOwnProfileUpdate({ firstName: ' New ' }), {
    firstName: 'New',
  });
  assert.deepEqual(validateOwnProfileUpdate({ username: '  ' }), {
    username: null,
  });
  assert.deepEqual(validateOwnProfileUpdate({ username: null }), {
    username: null,
  });
  assert.deepEqual(
    validateOwnProfileUpdate({
      firstName: 'A'.repeat(100),
      lastName: 'B'.repeat(100),
      username: 'x'.repeat(30),
    }),
    {
      firstName: 'A'.repeat(100),
      lastName: 'B'.repeat(100),
      username: 'x'.repeat(30),
    },
  );
  for (const body of [
    null,
    [],
    {},
    { userId: 'other' },
    { role: 'ADMIN' },
    { firstName: ' ' },
    { lastName: '' },
    { lastName: 1 },
    { username: 'x'.repeat(31) },
    { firstName: 'x'.repeat(101) },
  ]) {
    assert.throws(() => validateOwnProfileUpdate(body), ValidationError);
  }
});

test('contact validation trims fields, clears blanks and nulls, and enforces length and type limits', () => {
  for (const [field, maximum] of Object.entries(contactFieldLimits)) {
    const value =
      field === 'phoneNumber' ? '1'.repeat(maximum) : 'A'.repeat(maximum);
    assert.deepEqual(validateOwnProfileUpdate({ [field]: ` ${value} ` }), {
      [field]: value,
    });
    for (const blank of ['', ' \t\n ', null]) {
      assert.deepEqual(validateOwnProfileUpdate({ [field]: blank }), {
        [field]: null,
      });
    }
    for (const invalid of [`${value}1`, 42, false, [], {}]) {
      assert.throws(
        () => validateOwnProfileUpdate({ [field]: invalid }),
        ValidationError,
        `${field} must reject ${JSON.stringify(invalid)}`,
      );
    }
  }
  assert.deepEqual(validateOwnProfileUpdate(contactDetails), contactDetails);
  for (const phoneNumber of invalidPhoneNumbers) {
    assert.throws(
      () => validateOwnProfileUpdate({ phoneNumber }),
      ValidationError,
      `Invalid phone number: ${phoneNumber}`,
    );
  }
});

test('customers can load only their own public profile without secrets or picture bytes', async () => {
  const { app, issueToken, findUnique } = fixture();
  const response = await request(app)
    .get('/api/profile?userId=someone-else')
    .auth(await issueToken('customer-1'), { type: 'bearer' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.body, {
    id: 'customer-1',
    username: 'original',
    firstName: 'Test',
    lastName: 'Customer',
    email: 'private@example.com',
    addressLine1: null,
    addressLine2: null,
    town: null,
    postcode: null,
    phoneNumber: null,
    hasPhoto: false,
  });
  assert.deepEqual(findUnique.mock.calls.at(-1)?.arguments[0].where, {
    id: 'customer-1',
  });
});

test('all supported account roles can read and update their own profiles', async () => {
  const { app, record, issueToken } = fixture();
  const token = await issueToken(record.id);
  for (const role of supportedRoles) {
    record.role = role;
    assert.equal(
      (await request(app).get('/api/profile').auth(token, { type: 'bearer' }))
        .status,
      200,
    );
    assert.equal(
      (
        await request(app)
          .patch('/api/profile')
          .auth(token, { type: 'bearer' })
          .send({ firstName: 'Updated' })
      ).status,
      200,
    );
  }
});

test('profile changes persist on reload and preserve omitted fields and credentials', async () => {
  const { app, record, issueToken, update } = fixture();
  const token = await issueToken('customer-1');
  const response = await request(app)
    .patch('/api/profile')
    .auth(token, { type: 'bearer' })
    .send({ username: ' renamed ', firstName: ' New ' });
  assert.equal(response.status, 200);
  assert.equal(response.body.username, 'renamed');
  assert.equal(response.body.firstName, 'New');
  assert.equal(response.body.lastName, 'Customer');
  assert.equal(record.passwordHash, 'never-return-this');
  assert.deepEqual(update.mock.calls[0]?.arguments[0].data, {
    username: 'renamed',
    firstName: 'New',
  });
  const reload = await request(app)
    .get('/api/profile')
    .auth(token, { type: 'bearer' });
  assert.deepEqual(reload.body, response.body);
  assert.equal(
    (
      await request(app)
        .patch('/api/profile')
        .auth(token, { type: 'bearer' })
        .send({ username: 'renamed' })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app)
        .patch('/api/profile')
        .auth(token, { type: 'bearer' })
        .send({ username: null })
    ).body.username,
    null,
  );
});

test('contact PATCH updates are trimmed, persisted on reload and preserve omitted fields', async () => {
  const { app, record, issueToken, update } = fixture();
  const token = await issueToken(record.id);
  const maximumDetails = Object.fromEntries(
    Object.entries(contactFieldLimits).map(([field, maximum]) => [
      field,
      field === 'phoneNumber' ? '1'.repeat(maximum) : 'A'.repeat(maximum),
    ]),
  );
  for (const details of [contactDetails, maximumDetails]) {
    const response = await request(app)
      .patch('/api/profile')
      .auth(token, { type: 'bearer' })
      .send(
        Object.fromEntries(
          Object.entries(details).map(([field, value]) => [
            field,
            ` ${value} `,
          ]),
        ),
      );
    assert.equal(response.status, 200);
    assert.deepEqual(update.mock.calls.at(-1)?.arguments[0].data, details);
    assert.deepEqual(response.body, {
      id: record.id,
      username: record.username,
      firstName: record.firstName,
      lastName: record.lastName,
      email: record.email,
      ...details,
      hasPhoto: false,
    });
    const reload = await request(app)
      .get('/api/profile')
      .auth(token, { type: 'bearer' });
    assert.equal(reload.status, 200);
    assert.deepEqual(reload.body, response.body);

    const partial = { firstName: 'Updated', addressLine1: '34 New Road' };
    const preserved = { ...response.body, ...partial };
    const partialResponse = await request(app)
      .patch('/api/profile')
      .auth(token, { type: 'bearer' })
      .send(partial);
    assert.equal(partialResponse.status, 200);
    assert.deepEqual(partialResponse.body, preserved);
    assert.deepEqual(update.mock.calls.at(-1)?.arguments[0].data, partial);
    const partialReload = await request(app)
      .get('/api/profile')
      .auth(token, { type: 'bearer' });
    assert.equal(partialReload.status, 200);
    assert.deepEqual(partialReload.body, preserved);
  }
});

test('each contact field can be cleared with blank or null PATCH values and stays cleared on reload', async () => {
  const { app, record, issueToken, update } = fixture();
  const token = await issueToken(record.id);
  for (const field of Object.keys(contactFieldLimits)) {
    for (const blank of ['', ' \t\n ', null]) {
      const seed = await request(app)
        .patch('/api/profile')
        .auth(token, { type: 'bearer' })
        .send(contactDetails);
      assert.equal(seed.status, 200);
      const response = await request(app)
        .patch('/api/profile')
        .auth(token, { type: 'bearer' })
        .send({ [field]: blank });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { ...seed.body, [field]: null });
      assert.deepEqual(update.mock.calls.at(-1)?.arguments[0].data, {
        [field]: null,
      });
      const reload = await request(app)
        .get('/api/profile')
        .auth(token, { type: 'bearer' });
      assert.equal(reload.status, 200);
      assert.deepEqual(reload.body, response.body);
    }
  }
});

test('invalid contact PATCH values are rejected without persisting any changes', async () => {
  const { app, record, issueToken, update } = fixture();
  const token = await issueToken(record.id);
  Object.assign(record, contactDetails);
  const original = { ...record };
  const invalidUpdates = Object.entries(contactFieldLimits).flatMap(
    ([field, maximum]) => [
      { [field]: '1'.repeat(maximum + 1) },
      { [field]: 42 },
    ],
  );
  invalidUpdates.push(
    ...invalidPhoneNumbers.map((phoneNumber) => ({ phoneNumber })),
  );
  for (const invalid of invalidUpdates) {
    const response = await request(app)
      .patch('/api/profile')
      .auth(token, { type: 'bearer' })
      .send({ firstName: 'Must not persist', ...invalid });
    assert.equal(response.status, 400, JSON.stringify(invalid));
    assert.equal(update.mock.callCount(), 0);
    assert.deepEqual(record, original);
  }
});

test('duplicate usernames return a conflict and leave the profile unchanged', async () => {
  const { app, record, issueToken } = fixture();
  const response = await request(app)
    .patch('/api/profile')
    .auth(await issueToken(record.id), { type: 'bearer' })
    .send({ username: 'taken', firstName: 'Not saved' });
  assert.equal(response.status, 409);
  assert.equal(response.body.message, 'That username is already in use.');
  assert.equal(record.firstName, 'Test');
  assert.equal(record.username, 'original');
});

test('profile APIs reject identity overrides, invalid fields and unsupported request types', async () => {
  const { app, record, update, issueToken } = fixture();
  const token = await issueToken(record.id);
  for (const body of [
    { id: 'other', firstName: 'Changed' },
    { userId: 'other' },
    { role: 'ADMIN' },
    { email: 'other@example.com' },
    { firstName: '' },
    { username: 42 },
    {},
  ]) {
    assert.equal(
      (
        await request(app)
          .patch('/api/profile')
          .auth(token, { type: 'bearer' })
          .send(body)
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await request(app)
        .patch('/api/profile')
        .auth(token, { type: 'bearer' })
        .type('form')
        .send({ firstName: 'Name' })
    ).status,
    415,
  );
  assert.equal(
    (
      await request(app)
        .patch('/api/profile/other')
        .auth(token, { type: 'bearer' })
        .send({ firstName: 'Changed' })
    ).status,
    404,
  );
  assert.equal(update.mock.callCount(), 0);
});

test('every profile endpoint rejects missing, expired, forged and deleted-user sessions', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { app, issueToken, state, update } = fixture();
  const expired = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('customer-1')
    .setIssuer('ctrl-alt-elite-backend')
    .setAudience('ctrl-alt-elite-api')
    .setIssuedAt()
    .setExpirationTime(1)
    .sign(new TextEncoder().encode(secret));
  const endpoints = [
    () => request(app).get('/api/profile'),
    () => request(app).patch('/api/profile').send({ firstName: 'Changed' }),
    () => request(app).get('/api/profile/photo'),
    () =>
      request(app)
        .put('/api/profile/photo')
        .type('image/png')
        .send(Buffer.from('invalid')),
    () => request(app).delete('/api/profile/photo'),
  ];
  for (const endpoint of endpoints) {
    for (const token of ['', 'forged', expired]) {
      const req = endpoint();
      if (token) req.auth(token, { type: 'bearer' });
      assert.equal((await req).status, 401);
    }
    state.exists = false;
    assert.equal(
      (
        await endpoint().auth(await issueToken('customer-1'), {
          type: 'bearer',
        })
      ).status,
      401,
    );
    state.exists = true;
  }
  assert.equal(update.mock.callCount(), 0);
});

test('picture uploads are decoded, resized, persisted and removable', async () => {
  const { app, issueToken, record } = fixture();
  const token = await issueToken(record.id);
  for (const format of ['png', 'jpeg', 'webp'] as const) {
    const bytes = await sharp({
      create: { width: 600, height: 600, channels: 3, background: '#15803d' },
    })
      .toFormat(format)
      .toBuffer();
    const upload = await request(app)
      .put('/api/profile/photo')
      .auth(token, { type: 'bearer' })
      .type(`image/${format}`)
      .send(bytes);
    assert.equal(upload.status, 200);
    assert.equal(upload.body.hasPhoto, true);
    const read = await request(app)
      .get('/api/profile/photo')
      .auth(token, { type: 'bearer' });
    assert.equal(read.status, 200);
    assert.equal(read.headers['content-type'], 'image/webp');
    assert.equal(read.headers['x-content-type-options'], 'nosniff');
    assert.equal(read.headers['cache-control'], 'no-store');
    const metadata = await sharp(read.body).metadata();
    assert.equal(metadata.width, 512);
    assert.equal(metadata.height, 512);
    assert.equal(metadata.exif, undefined);
  }
  assert.equal(
    (
      await request(app)
        .delete('/api/profile/photo')
        .auth(token, { type: 'bearer' })
    ).body.hasPhoto,
    false,
  );
  assert.equal(record.profilePhoto, null);
  assert.equal(
    (
      await request(app)
        .get('/api/profile/photo')
        .auth(token, { type: 'bearer' })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(app)
        .delete('/api/profile/photo')
        .auth(token, { type: 'bearer' })
    ).status,
    200,
  );
});

test('picture validation rejects corrupt files, SVG, oversized bytes and excessive dimensions without writing', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { app, record, issueToken, update } = fixture();
  const token = await issueToken(record.id);
  for (const bytes of [
    Buffer.alloc(0),
    Buffer.from('not an image'),
    Buffer.from('89504e470d0a1a0a', 'hex'),
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    ),
  ]) {
    assert.equal(
      (
        await request(app)
          .put('/api/profile/photo')
          .auth(token, { type: 'bearer' })
          .type('image/png')
          .send(bytes)
      ).status,
      400,
    );
  }
  const huge = await sharp({
    create: { width: 4001, height: 4000, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
  assert.equal(
    (
      await request(app)
        .put('/api/profile/photo')
        .auth(token, { type: 'bearer' })
        .type('image/png')
        .send(huge)
    ).status,
    400,
  );
  assert.equal(
    (
      await request(app)
        .put('/api/profile/photo')
        .auth(token, { type: 'bearer' })
        .type('image/png')
        .send(Buffer.alloc(MAX_PROFILE_PHOTO_BYTES + 1))
    ).status,
    413,
  );
  assert.equal(
    (
      await request(app)
        .put('/api/profile/photo')
        .auth(token, { type: 'bearer' })
        .type('image/svg+xml')
        .send('<svg/>')
    ).status,
    415,
  );
  assert.equal(update.mock.callCount(), 0);
});

test('pictures at the exact 20 MiB and 16 megapixel limits are accepted', async () => {
  assert.equal(MAX_PROFILE_PHOTO_BYTES, 20 * 1024 * 1024);
  const { app, record, issueToken } = fixture();
  const image = await sharp({
    create: { width: 4000, height: 4000, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
  assert.ok(image.length < MAX_PROFILE_PHOTO_BYTES);
  const bytes = Buffer.alloc(MAX_PROFILE_PHOTO_BYTES);
  image.copy(bytes);
  const response = await request(app)
    .put('/api/profile/photo')
    .auth(await issueToken(record.id), { type: 'bearer' })
    .type('image/png')
    .send(bytes);
  assert.equal(response.status, 200);
  assert.equal(response.body.hasPhoto, true);
});

test('database outages return an explicit service error instead of a successful profile response', async (context) => {
  context.mock.method(console, 'error', () => {});
  const { app, state, issueToken } = fixture();
  state.failure = new Prisma.PrismaClientKnownRequestError(
    'private database details',
    { code: 'P1001', clientVersion: '7' },
  );
  const response = await request(app)
    .get('/api/profile')
    .auth(await issueToken('customer-1'), { type: 'bearer' });
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, {
    message: 'Service temporarily unavailable.',
  });
});
