import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client';
import { createAuthorization } from '../src/middleware/authorization_middleware';

const secret = 'test-only-secret-with-at-least-32-bytes';
const customerId = 'customer-1';
const ticketId = 'T-1001';
const otherTicketId = 'T-1002';
const base = '/api/support/tickets';
const adminBase = '/api/admin/support/tickets';
const input = {
  subject: 'Missing parcel',
  category: 'DELIVERY_ISSUE',
  description: 'My parcel has not arrived.',
};
const ticket = {
  id: ticketId,
  ...input,
  status: 'OPEN',
  createdAt: new Date('2026-10-27T10:00:00Z'),
  updatedAt: new Date('2026-10-27T11:00:00Z'),
};
const ticketJson = JSON.parse(JSON.stringify(ticket));
const ticketSelect = {
  id: true,
  subject: true,
  category: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};
const adminTicketSelect = {
  ...ticketSelect,
  customer: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
};
const adminTicket = {
  ...ticket,
  customer: {
    id: customerId,
    firstName: 'Sam',
    lastName: 'Jones',
    email: 'sam@example.com',
  },
};
const adminTicketJson = JSON.parse(
  JSON.stringify({
    ...adminTicket,
    customerId,
    customerName: 'Sam Jones',
    customerEmail: 'sam@example.com',
  }),
);
const messages = [
  {
    id: 'message-1',
    body: 'We are checking with the courier.',
    createdAt: new Date('2026-10-27T10:30:00Z'),
    author: { firstName: 'Alex', lastName: 'Smith', role: 'ADMIN' },
  },
];
const commentsJson = [
  {
    id: 'message-1',
    body: 'We are checking with the courier.',
    createdAt: '2026-10-27T10:30:00.000Z',
    authorName: 'Alex Smith',
    authorRole: 'ADMIN',
  },
];

async function fixture() {
  const state = {
    role: 'CUSTOMER',
    exists: true,
    closed: false,
    tickets: [ticket],
    messages,
    failure: undefined as Error | undefined,
  };
  const user = {
    findUnique: mock.fn(async () =>
      state.exists ? { role: state.role } : null,
    ),
  };
  const ticketMessage = {
    create: mock.fn(async (query: { data: { body: string } }) => ({
      id: 'message-2',
      body: query.data.body,
      createdAt: new Date('2026-10-27T12:00:00Z'),
      author: {
        firstName: 'Sam',
        lastName: 'Jones',
        role: state.role,
      },
    })),
  };
  const supportTicket = {
    create: mock.fn(async (_query: unknown) => ticket),
    findMany: mock.fn(async (query: { where?: unknown }) =>
      query.where ? state.tickets : [adminTicket],
    ),
    findUnique: mock.fn(async (query: { where: { id: string } }) =>
      query.where.id === ticketId ? adminTicket : null,
    ),
    updateMany: mock.fn(async (_query: unknown) => ({
      count: state.closed ? 0 : 1,
    })),
    update: mock.fn(
      async (query: { where: { id: string }; data: { status: string } }) => {
        if (query.where.id !== ticketId) {
          throw new Prisma.PrismaClientKnownRequestError('Not found', {
            code: 'P2025',
            clientVersion: 'test',
          });
        }
        return { ...adminTicket, status: query.data.status };
      },
    ),
    findFirst: mock.fn(
      async (query: {
        where: { id: string; customerId?: string };
        select: { messages?: unknown };
      }) => {
        if (state.failure) throw state.failure;
        if (
          query.where.id !== ticketId ||
          (query.where.customerId !== undefined &&
            query.where.customerId !== customerId)
        ) {
          return null;
        }
        if (query.select.messages) return { messages: state.messages };
        return 'status' in query.select ? ticket : { id: ticketId };
      },
    ),
  };
  const database = {
    user,
    supportTicket,
    ticketMessage,
    $transaction: async (fn: (tx: unknown) => unknown) => fn(database),
  } as unknown as PrismaClient;
  const app = createApp(database, 'http://localhost:5500', secret);
  const { issueToken } = createAuthorization(database, secret);
  return {
    app,
    state,
    user,
    supportTicket,
    ticketMessage,
    token: await issueToken(customerId),
    otherToken: await issueToken('customer-2'),
  };
}

test('creates an OPEN ticket using only validated fields and verified customer identity', async () => {
  const { app, token, supportTicket } = await fixture();
  const response = await request(app)
    .post(base)
    .auth(token, { type: 'bearer' })
    .send({
      ...input,
      subject: ` ${input.subject} `,
      description: ` ${input.description} `,
      customerId: 'victim',
      status: 'CLOSED',
      createdAt: '2000-01-01',
    });

  assert.equal(response.status, 201);
  assert.equal(response.headers.location, `${base}/${ticketId}`);
  assert.deepEqual(response.body, { ticket: ticketJson });
  assert.deepEqual(supportTicket.create.mock.calls[0]?.arguments, [
    { data: { customerId, ...input }, select: ticketSelect },
  ]);
});

test('requires authentication on all customer ticket endpoints', async () => {
  const { app, supportTicket } = await fixture();
  const responses = [
    await request(app).post(base).send(input),
    await request(app).get(base),
    await request(app).get(`${base}/${ticketId}`),
    await request(app).get(`${base}/${ticketId}/comments`),
  ];
  for (const response of responses) {
    assert.equal(response.status, 401);
    assert.equal(response.headers['www-authenticate'], 'Bearer');
  }
  assert.equal(supportTicket.create.mock.callCount(), 0);
  assert.equal(supportTicket.findMany.mock.callCount(), 0);
  assert.equal(supportTicket.findFirst.mock.callCount(), 0);
});

test('rejects invalid tokens, deleted accounts, and unsupported roles', async () => {
  const { app, state, token, supportTicket } = await fixture();
  assert.equal(
    (await request(app).get(base).auth('invalid', { type: 'bearer' })).status,
    401,
  );
  state.exists = false;
  assert.equal(
    (await request(app).get(base).auth(token, { type: 'bearer' })).status,
    401,
  );
  state.exists = true;
  state.role = 'UNSUPPORTED';
  assert.equal(
    (await request(app).get(base).auth(token, { type: 'bearer' })).status,
    403,
  );
  assert.equal(supportTicket.findMany.mock.callCount(), 0);
});

test('allows an admin to create and list their own tickets', async () => {
  const { app, state, token, supportTicket } = await fixture();
  state.role = 'ADMIN';
  const created = await request(app)
    .post(base)
    .auth(token, { type: 'bearer' })
    .send(input);
  assert.equal(created.status, 201);
  assert.deepEqual(supportTicket.create.mock.calls[0]?.arguments, [
    { data: { customerId, ...input }, select: ticketSelect },
  ]);
  const list = await request(app).get(base).auth(token, { type: 'bearer' });
  assert.equal(list.status, 200);
});

test('rejects missing, blank, oversized, incorrectly typed fields and invalid categories', async () => {
  const { app, token, supportTicket } = await fixture();
  const bodies: (object | string | undefined)[] = [
    undefined,
    'null',
    [],
    {},
    ...[
      { subject: '' },
      { subject: '   ' },
      { subject: 12 },
      { subject: 'x'.repeat(151) },
      { description: '' },
      { description: '   ' },
      { description: null },
      { description: 'x'.repeat(2001) },
      { category: '' },
      { category: 'INVALID' },
      { category: 'GENERAL' },
      { category: null },
    ].map((change) => ({ ...input, ...change })),
  ];
  for (const body of bodies) {
    const response = await request(app)
      .post(base)
      .auth(token, { type: 'bearer' })
      .set('Content-Type', 'application/json')
      .send(body);
    assert.equal(response.status, 400);
    assert.equal(typeof response.body.message, 'string');
  }
  assert.equal(supportTicket.create.mock.callCount(), 0);
});

test('accepts each documented category and maximum field lengths', async () => {
  const { app, token, supportTicket } = await fixture();
  const categories = [
    'ACCOUNT_ISSUE',
    'ORDER_ISSUE',
    'DELIVERY_ISSUE',
    'RETURNS_REFUNDS',
    'PRODUCT_ENQUIRY',
    'OTHER',
  ];
  for (const category of categories) {
    const response = await request(app)
      .post(base)
      .auth(token, { type: 'bearer' })
      .send({
        category,
        subject: 'x'.repeat(150),
        description: 'x'.repeat(2000),
      });
    assert.equal(response.status, 201);
  }
  assert.equal(supportTicket.create.mock.callCount(), categories.length);
});

test('rejects non-JSON, malformed JSON, and oversized request bodies', async () => {
  const { app, token, supportTicket } = await fixture();
  const responses = [
    await request(app)
      .post(base)
      .auth(token, { type: 'bearer' })
      .type('form')
      .send(input),
    await request(app)
      .post(base)
      .auth(token, { type: 'bearer' })
      .type('json')
      .send('{'),
    await request(app)
      .post(base)
      .auth(token, { type: 'bearer' })
      .send({ ...input, description: 'x'.repeat(17000) }),
  ];
  assert.deepEqual(
    responses.map((response) => response.status),
    [415, 400, 413],
  );
  assert.equal(supportTicket.create.mock.callCount(), 0);
});

test('lists only the authenticated customer tickets, newest first, ignoring owner query parameters', async () => {
  const { app, token, supportTicket, state } = await fixture();
  const response = await request(app)
    .get(`${base}?customerId=victim`)
    .auth(token, { type: 'bearer' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { tickets: [ticketJson] });
  assert.deepEqual(supportTicket.findMany.mock.calls[0]?.arguments, [
    {
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: ticketSelect,
    },
  ]);
  state.tickets = [];
  const empty = await request(app).get(base).auth(token, { type: 'bearer' });
  assert.deepEqual(empty.body, { tickets: [] });
});

test('returns full details for an owned ticket', async () => {
  const { app, token, supportTicket } = await fixture();
  const response = await request(app)
    .get(`${base}/${ticketId}`)
    .auth(token, { type: 'bearer' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ticket: ticketJson });
  assert.deepEqual(supportTicket.findFirst.mock.calls[0]?.arguments, [
    { where: { id: ticketId, customerId }, select: ticketSelect },
  ]);
});

test('denies access to another customer ticket and conversation without revealing existence', async () => {
  const { app, token, otherToken } = await fixture();
  for (const suffix of ['', '/comments']) {
    for (const [id, identity] of [
      [ticketId, otherToken],
      [otherTicketId, token],
      ['T-9999', token],
    ]) {
      const response = await request(app)
        .get(`${base}/${id}${suffix}`)
        .auth(identity as string, { type: 'bearer' });
      assert.equal(response.status, 404);
      assert.deepEqual(response.body, { message: 'Support ticket not found.' });
    }
  }
});

test('validates ticket IDs before querying', async () => {
  const { app, token, supportTicket } = await fixture();
  for (const id of ['bad%20id', 'bad_id', 'x'.repeat(65)]) {
    for (const suffix of ['', '/comments']) {
      const response = await request(app)
        .get(`${base}/${id}${suffix}`)
        .auth(token, { type: 'bearer' });
      assert.equal(response.status, 400);
      assert.equal(response.body.errors[0].field, 'ticketId');
    }
  }
  assert.equal(supportTicket.findFirst.mock.callCount(), 0);
});

test('returns comments using an owner-scoped chronological query', async () => {
  const { app, token, state } = await fixture();
  const response = await request(app)
    .get(`${base}/${ticketId}/comments`)
    .auth(token, { type: 'bearer' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.body, { comments: commentsJson });
  state.messages = [];
  const empty = await request(app)
    .get(`${base}/${ticketId}/comments`)
    .auth(token, { type: 'bearer' });
  assert.deepEqual(empty.body, { comments: [] });
});

test('customer adds a comment with server-set author and role', async () => {
  const { app, token, ticketMessage, supportTicket } = await fixture();
  const response = await request(app)
    .post(`${base}/${ticketId}/comments`)
    .auth(token, { type: 'bearer' })
    .send({
      body: '  <b>Thanks</b>  ',
      authorId: 'victim',
      authorRole: 'ADMIN',
      createdAt: '2000-01-01',
    });
  assert.equal(response.status, 201);
  assert.deepEqual(response.body, {
    comment: {
      id: 'message-2',
      body: '<b>Thanks</b>',
      createdAt: '2026-10-27T12:00:00.000Z',
      authorName: 'Sam Jones',
      authorRole: 'CUSTOMER',
    },
  });
  assert.deepEqual(ticketMessage.create.mock.calls[0]?.arguments[0], {
    data: { ticketId, authorId: customerId, body: '<b>Thanks</b>' },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { firstName: true, lastName: true, role: true } },
    },
  });
  const lookup = supportTicket.findFirst.mock.calls[0]?.arguments[0];
  assert.deepEqual(lookup?.where, { id: ticketId, customerId });
});

test('rejects empty, blank, oversized and non-string comment bodies', async () => {
  const { app, token, ticketMessage } = await fixture();
  for (const body of [
    {},
    { body: '' },
    { body: '   ' },
    { body: 5 },
    { body: 'x'.repeat(2001) },
  ]) {
    const response = await request(app)
      .post(`${base}/${ticketId}/comments`)
      .auth(token, { type: 'bearer' })
      .send(body);
    assert.equal(response.status, 400);
    assert.equal(typeof response.body.message, 'string');
  }
  const max = await request(app)
    .post(`${base}/${ticketId}/comments`)
    .auth(token, { type: 'bearer' })
    .send({ body: 'x'.repeat(2000) });
  assert.equal(max.status, 201);
  assert.equal(ticketMessage.create.mock.callCount(), 1);
});

test('rejects comments on closed tickets with 409', async () => {
  const { app, state, token, ticketMessage } = await fixture();
  state.closed = true;
  const response = await request(app)
    .post(`${base}/${ticketId}/comments`)
    .auth(token, { type: 'bearer' })
    .send({ body: 'Hello' });
  assert.equal(response.status, 409);
  assert.deepEqual(response.body, { message: 'This ticket is closed.' });
  assert.equal(ticketMessage.create.mock.callCount(), 0);
});

test('customers cannot read or comment on other tickets', async () => {
  const { app, token, otherToken, ticketMessage } = await fixture();
  for (const [id, identity] of [
    [ticketId, otherToken],
    [otherTicketId, token],
  ]) {
    const get = await request(app)
      .get(`${base}/${id}/comments`)
      .auth(identity as string, { type: 'bearer' });
    const post = await request(app)
      .post(`${base}/${id}/comments`)
      .auth(identity as string, { type: 'bearer' })
      .send({ body: 'Hello' });
    assert.equal(get.status, 404);
    assert.equal(post.status, 404);
  }
  assert.equal(ticketMessage.create.mock.callCount(), 0);
});

test('comment endpoints require authentication', async () => {
  const { app } = await fixture();
  for (const url of [
    `${base}/${ticketId}/comments`,
    `${adminBase}/${ticketId}/comments`,
  ]) {
    assert.equal((await request(app).get(url)).status, 401);
    assert.equal(
      (await request(app).post(url).send({ body: 'Hi' })).status,
      401,
    );
  }
});

test('admin comments: customers get 403, admins can read and write any ticket', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { app, state, token, ticketMessage } = await fixture();
  const url = `${adminBase}/${ticketId}/comments`;
  assert.equal(
    (await request(app).get(url).auth(token, { type: 'bearer' })).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post(url)
        .auth(token, { type: 'bearer' })
        .send({ body: 'Hi' })
    ).status,
    403,
  );

  state.role = 'ADMIN';
  const list = await request(app).get(url).auth(token, { type: 'bearer' });
  assert.equal(list.status, 200);
  assert.equal(list.headers['cache-control'], 'no-store');
  assert.deepEqual(list.body, { comments: commentsJson });

  const created = await request(app)
    .post(url)
    .auth(token, { type: 'bearer' })
    .send({ body: 'We have refunded your order.' });
  assert.equal(created.status, 201);
  assert.equal(created.body.comment.authorRole, 'ADMIN');
  assert.equal(ticketMessage.create.mock.callCount(), 1);

  state.closed = true;
  const closed = await request(app)
    .post(url)
    .auth(token, { type: 'bearer' })
    .send({ body: 'Hi' });
  assert.equal(closed.status, 409);
  assert.deepEqual(closed.body, { message: 'This ticket is closed.' });

  const missing = await request(app)
    .get(`${adminBase}/${otherTicketId}/comments`)
    .auth(token, { type: 'bearer' });
  assert.equal(missing.status, 404);
});

test('does not expose database failure details', async (context) => {
  context.mock.method(console, 'error', () => {});
  const { app, token, state } = await fixture();
  state.failure = new Error('Private connection details');
  const response = await request(app)
    .get(`${base}/${ticketId}`)
    .auth(token, { type: 'bearer' });
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    message: 'Unable to complete the request.',
  });
});

test('admin endpoints require an admin', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { app, state, token, supportTicket } = await fixture();
  const call = (auth?: string) => {
    const req = request(app).get(adminBase);
    return auth ? req.auth(auth, { type: 'bearer' }) : req;
  };
  assert.equal((await call()).status, 401);
  assert.equal((await call(token)).status, 403);
  assert.equal(
    (
      await request(app)
        .patch(`${adminBase}/${ticketId}/status`)
        .auth(token, { type: 'bearer' })
        .send({ status: 'CLOSED' })
    ).status,
    403,
  );
  assert.equal(state.role, 'CUSTOMER');
  assert.equal(supportTicket.update.mock.callCount(), 0);
});

test('admin lists and fetches tickets with customer details', async () => {
  const { app, state, token } = await fixture();
  state.role = 'ADMIN';
  const list = await request(app)
    .get(adminBase)
    .auth(token, { type: 'bearer' });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body, { tickets: [adminTicketJson] });

  const detail = await request(app)
    .get(`${adminBase}/${ticketId}`)
    .auth(token, { type: 'bearer' });
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body, { ticket: adminTicketJson });

  const missing = await request(app)
    .get(`${adminBase}/${otherTicketId}`)
    .auth(token, { type: 'bearer' });
  assert.equal(missing.status, 404);
});

test('admin updates ticket status with validation', async () => {
  const { app, state, token, supportTicket } = await fixture();
  state.role = 'ADMIN';
  const ok = await request(app)
    .patch(`${adminBase}/${ticketId}/status`)
    .auth(token, { type: 'bearer' })
    .send({ status: 'IN_PROGRESS', subject: 'ignored' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ticket.status, 'IN_PROGRESS');
  assert.deepEqual(supportTicket.update.mock.calls[0]?.arguments, [
    {
      where: { id: ticketId },
      data: { status: 'IN_PROGRESS' },
      select: adminTicketSelect,
    },
  ]);

  for (const body of [{}, { status: 'DONE' }, { status: null }]) {
    const response = await request(app)
      .patch(`${adminBase}/${ticketId}/status`)
      .auth(token, { type: 'bearer' })
      .send(body);
    assert.equal(response.status, 400);
    assert.equal(typeof response.body.message, 'string');
  }
  assert.equal(
    (
      await request(app)
        .patch(`${adminBase}/${ticketId}/status`)
        .auth(token, { type: 'bearer' })
        .type('form')
        .send({ status: 'CLOSED' })
    ).status,
    415,
  );
  assert.equal(
    (
      await request(app)
        .patch(`${adminBase}/${otherTicketId}/status`)
        .auth(token, { type: 'bearer' })
        .send({ status: 'CLOSED' })
    ).status,
    404,
  );
});
