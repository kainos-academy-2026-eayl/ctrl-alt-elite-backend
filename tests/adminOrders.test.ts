import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createAuthorization } from '../src/middleware/authorization_middleware';

const secret = 'test-only-secret-with-at-least-32-bytes';
const orderId = '6c0d342d-3f30-475d-8a13-2742cf09c105';
const mugId = '22222222-2222-4222-8222-222222222222';
const lampId = '11111111-1111-4111-8111-111111111111';

const customer = {
  id: 'customer-1',
  firstName: 'Account',
  lastName: 'Holder',
  email: 'account@example.com',
  phoneNumber: '07700900999',
};

const fullOrder = {
  id: orderId,
  order_total: 60.47,
  order_status: 'PENDING',
  createdAt: new Date('2026-11-04T10:00:00Z'),
  first_name: 'Sam',
  last_name: 'Jones',
  email: 'sam@example.com',
  phone: '07700900123',
  address_line1: '1 High Street',
  address_line2: null,
  town: 'Belfast',
  postcode: 'BT1 1AA',
  delivery_option: 'express',
  delivery_price_pence: 499,
  customer,
  products: [
    {
      product_id: lampId,
      amount: 2,
      unit_price_pence: 2499,
      product: { name: 'Desk Lamp' },
    },
    {
      product_id: mugId,
      amount: 1,
      unit_price_pence: 550,
      product: { name: 'Ceramic Mug' },
    },
  ],
};

const legacyOrder = {
  ...fullOrder,
  first_name: null,
  last_name: null,
  email: null,
  phone: null,
  address_line1: null,
  address_line2: null,
  town: null,
  postcode: null,
  delivery_option: null,
  delivery_price_pence: 0,
};

type NullableField =
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'address_line1'
  | 'address_line2'
  | 'town'
  | 'postcode'
  | 'delivery_option';
type Row = Omit<typeof fullOrder, NullableField> &
  Record<NullableField, string | null>;

async function fixture(rows: Row[] = [fullOrder], total = rows.length) {
  const state = { role: 'ADMIN' };
  const order = {
    findMany: mock.fn(async (_args: unknown) => rows),
    count: mock.fn(async (_args: unknown) => total),
    findUnique: mock.fn(async (_args: unknown) => rows[0] ?? null),
  };
  const database = {
    user: {
      findUnique: async () => ({ role: state.role }),
    },
    order,
  } as unknown as PrismaClient;
  const { issueToken } = createAuthorization(database, secret);
  return {
    state,
    order,
    app: createApp(database, 'http://localhost:5500', secret),
    token: await issueToken('staff-1'),
  };
}

function findManyArgs(order: { findMany: { mock: { calls: unknown[] } } }) {
  const call = order.findMany.mock.calls[0] as { arguments: unknown[] };
  return call.arguments[0] as {
    where: Record<string, unknown>;
    orderBy: unknown;
    skip: number;
    take: number;
  };
}

test('order endpoints require a valid token', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { app } = await fixture();
  for (const path of ['/api/admin/orders', `/api/admin/orders/${orderId}`]) {
    const missing = await request(app).get(path);
    assert.equal(missing.status, 401, path);
    assert.equal(missing.headers['cache-control'], 'no-store');
    assert.equal(missing.headers['www-authenticate'], 'Bearer');

    const invalid = await request(app)
      .get(path)
      .auth('not-a-token', { type: 'bearer' });
    assert.equal(invalid.status, 401, path);
  }
});

test('admin and customer service can read orders; other roles get 403', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { app, state, token } = await fixture();
  for (const role of ['ADMIN', 'CUSTOMER_SERVICE']) {
    state.role = role;
    const response = await request(app)
      .get('/api/admin/orders')
      .auth(token, { type: 'bearer' });
    assert.equal(response.status, 200, role);
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  for (const role of ['CUSTOMER', 'INVENTORY_MANAGEMENT']) {
    state.role = role;
    for (const path of ['/api/admin/orders', `/api/admin/orders/${orderId}`]) {
      const response = await request(app)
        .get(path)
        .auth(token, { type: 'bearer' });
      assert.equal(response.status, 403, `${role} ${path}`);
      assert.equal(response.headers['cache-control'], 'no-store');
    }
  }
});

test('invalid list query values return 400 with a message', async () => {
  const { app, order, token } = await fixture();
  for (const query of [
    'status=BOGUS',
    'status=pending',
    'sort=sideways',
    'page=0',
    'page=-1',
    'page=abc',
    'page=1.5',
    'pageSize=0',
    'pageSize=101',
    'pageSize=ten',
    `search=${'a'.repeat(201)}`,
  ]) {
    const response = await request(app)
      .get(`/api/admin/orders?${query}`)
      .auth(token, { type: 'bearer' });
    assert.equal(response.status, 400, query);
    assert.equal(typeof response.body.message, 'string', query);
  }
  assert.equal(order.findMany.mock.callCount(), 0);
});

test('list applies defaults and returns the contract shape', async () => {
  const { app, order, token } = await fixture([fullOrder, legacyOrder], 2);
  const response = await request(app)
    .get('/api/admin/orders')
    .auth(token, { type: 'bearer' });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    orders: [
      {
        id: orderId,
        customerName: 'Sam Jones',
        customerEmail: 'sam@example.com',
        status: 'PENDING',
        totalPence: 6047,
        itemCount: 3,
        createdAt: '2026-11-04T10:00:00.000Z',
      },
      {
        id: orderId,
        customerName: 'Account Holder',
        customerEmail: 'account@example.com',
        status: 'PENDING',
        totalPence: 6047,
        itemCount: 3,
        createdAt: '2026-11-04T10:00:00.000Z',
      },
    ],
    page: 1,
    pageSize: 10,
    total: 2,
    totalPages: 1,
  });
  const args = findManyArgs(order);
  assert.deepEqual(args.where, {});
  assert.deepEqual(args.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.equal(args.skip, 0);
  assert.equal(args.take, 10);
});

test('list never selects password hashes or other user fields', async () => {
  const { app, order, token } = await fixture();
  await request(app).get('/api/admin/orders').auth(token, { type: 'bearer' });
  const select = JSON.stringify(
    (findManyArgs(order) as unknown as { select: unknown }).select,
  );
  assert.equal(select.includes('passwordHash'), false);
});

test('sort options map to ordering with an id tiebreaker', async () => {
  const expected = {
    newest: [{ createdAt: 'desc' }, { id: 'desc' }],
    oldest: [{ createdAt: 'asc' }, { id: 'asc' }],
    totalDesc: [{ order_total: 'desc' }, { id: 'desc' }],
    totalAsc: [{ order_total: 'asc' }, { id: 'asc' }],
  };
  for (const [sort, orderBy] of Object.entries(expected)) {
    const { app, order, token } = await fixture();
    const response = await request(app)
      .get(`/api/admin/orders?sort=${sort}`)
      .auth(token, { type: 'bearer' });
    assert.equal(response.status, 200, sort);
    assert.deepEqual(findManyArgs(order).orderBy, orderBy, sort);
  }
});

test('status filter is applied to both the page and the count', async () => {
  const { app, order, token } = await fixture();
  await request(app)
    .get('/api/admin/orders?status=SHIPPED')
    .auth(token, { type: 'bearer' });
  assert.deepEqual(findManyArgs(order).where, { order_status: 'SHIPPED' });
  assert.deepEqual(
    (order.count.mock.calls[0] as { arguments: unknown[] }).arguments[0],
    { where: { order_status: 'SHIPPED' } },
  );
});

test('pagination computes skip, take and totalPages after filters', async () => {
  const { app, order, token } = await fixture([fullOrder], 25);
  const response = await request(app)
    .get('/api/admin/orders?page=3&pageSize=10')
    .auth(token, { type: 'bearer' });
  const args = findManyArgs(order);
  assert.equal(args.skip, 20);
  assert.equal(args.take, 10);
  assert.equal(response.body.page, 3);
  assert.equal(response.body.pageSize, 10);
  assert.equal(response.body.total, 25);
  assert.equal(response.body.totalPages, 3);
});

test('a page past the end is empty but keeps correct totals', async () => {
  const { app, token } = await fixture([], 25);
  const response = await request(app)
    .get('/api/admin/orders?page=9&pageSize=10')
    .auth(token, { type: 'bearer' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.orders, []);
  assert.equal(response.body.total, 25);
  assert.equal(response.body.totalPages, 3);
});

test('no matches gives zero totals and zero pages', async () => {
  const { app, token } = await fixture([], 0);
  const response = await request(app)
    .get('/api/admin/orders')
    .auth(token, { type: 'bearer' });
  assert.equal(response.body.total, 0);
  assert.equal(response.body.totalPages, 0);
});

test('search matches every word against names and emails, case-insensitively', async () => {
  const { app, order, token } = await fixture();
  await request(app)
    .get('/api/admin/orders?search=%20sam%20jones%20')
    .auth(token, { type: 'bearer' });
  const like = (word: string) => ({ contains: word, mode: 'insensitive' });
  const word = (w: string) => ({
    OR: [
      { first_name: like(w) },
      { last_name: like(w) },
      { email: like(w) },
      { customer: { firstName: like(w) } },
      { customer: { lastName: like(w) } },
      { customer: { email: like(w) } },
    ],
  });
  assert.deepEqual(findManyArgs(order).where, {
    OR: [{ AND: [word('sam'), word('jones')] }],
  });
});

test('search also matches the order id prefix with dashes stripped', async () => {
  const { app, order, token } = await fixture();
  await request(app)
    .get('/api/admin/orders?search=6C0D342D')
    .auth(token, { type: 'bearer' });
  const where = findManyArgs(order).where as { OR: unknown[] };
  assert.deepEqual(where.OR[1], {
    id: { startsWith: '6C0D342D', mode: 'insensitive' },
  });

  const longer = await fixture();
  await request(longer.app)
    .get('/api/admin/orders?search=6c0d342d3f30')
    .auth(longer.token, { type: 'bearer' });
  const longerWhere = findManyArgs(longer.order).where as { OR: unknown[] };
  assert.deepEqual(longerWhere.OR[1], {
    id: { startsWith: '6c0d342d-3f30', mode: 'insensitive' },
  });

  const text = await fixture();
  await request(text.app)
    .get('/api/admin/orders?search=sam')
    .auth(text.token, { type: 'bearer' });
  const textWhere = findManyArgs(text.order).where as { OR: unknown[] };
  assert.equal(textWhere.OR.length, 1);
});

test('blank search is ignored', async () => {
  const { app, order, token } = await fixture();
  await request(app)
    .get('/api/admin/orders?search=%20%20')
    .auth(token, { type: 'bearer' });
  assert.deepEqual(findManyArgs(order).where, {});
});

test('order detail returns the contract shape', async () => {
  const { app, token } = await fixture();
  const response = await request(app)
    .get(`/api/admin/orders/${orderId}`)
    .auth(token, { type: 'bearer' });

  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.body, {
    order: {
      id: orderId,
      status: 'PENDING',
      createdAt: '2026-11-04T10:00:00.000Z',
      totalPence: 6047,
      customer: {
        id: 'customer-1',
        name: 'Sam Jones',
        email: 'sam@example.com',
        phone: '07700900123',
      },
      delivery: {
        option: 'Express delivery',
        pricePence: 499,
        addressLine1: '1 High Street',
        addressLine2: null,
        town: 'Belfast',
        postcode: 'BT1 1AA',
      },
      items: [
        {
          productId: lampId,
          name: 'Desk Lamp',
          quantity: 2,
          unitPricePence: 2499,
        },
        {
          productId: mugId,
          name: 'Ceramic Mug',
          quantity: 1,
          unitPricePence: 550,
        },
      ],
    },
  });
  assert.equal(JSON.stringify(response.body).includes('passwordHash'), false);
});

test('an unknown delivery option falls back to the raw value', async () => {
  const { app, token } = await fixture([
    { ...fullOrder, delivery_option: 'drone' },
  ]);
  const response = await request(app)
    .get(`/api/admin/orders/${orderId}`)
    .auth(token, { type: 'bearer' });
  assert.equal(response.body.order.delivery.option, 'drone');
});

test('older orders with null checkout fields fall back to the user record', async () => {
  const { app, token } = await fixture([legacyOrder]);
  const response = await request(app)
    .get(`/api/admin/orders/${orderId}`)
    .auth(token, { type: 'bearer' });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.order.customer, {
    id: 'customer-1',
    name: 'Account Holder',
    email: 'account@example.com',
    phone: '07700900999',
  });
  assert.deepEqual(response.body.order.delivery, {
    option: null,
    pricePence: 0,
    addressLine1: null,
    addressLine2: null,
    town: null,
    postcode: null,
  });
});

test('a missing phone everywhere is null', async () => {
  const { app, token } = await fixture([
    {
      ...legacyOrder,
      customer: { ...customer, phoneNumber: null as unknown as string },
    },
  ]);
  const response = await request(app)
    .get(`/api/admin/orders/${orderId}`)
    .auth(token, { type: 'bearer' });
  assert.equal(response.body.order.customer.phone, null);
});

test('order detail returns 400 for an invalid id and 404 for an unknown one', async (context) => {
  context.mock.method(console, 'error', () => {});
  const { app, order, token } = await fixture();
  const invalid = await request(app)
    .get('/api/admin/orders/not-a-uuid')
    .auth(token, { type: 'bearer' });
  assert.equal(invalid.status, 400);
  assert.equal(typeof invalid.body.message, 'string');
  assert.equal(order.findUnique.mock.callCount(), 0);

  order.findUnique.mock.mockImplementation(async () => null);
  const unknown = await request(app)
    .get(`/api/admin/orders/${orderId}`)
    .auth(token, { type: 'bearer' });
  assert.equal(unknown.status, 404);
  assert.equal(typeof unknown.body.message, 'string');
});

test('status and search filters combine into a single where clause', async () => {
  const { app, order, token } = await fixture();
  await request(app)
    .get('/api/admin/orders?status=DELIVERED&search=sam')
    .auth(token, { type: 'bearer' });
  const where = findManyArgs(order).where as Record<string, unknown>;
  assert.equal(where.order_status, 'DELIVERED');
  assert.equal(Array.isArray(where.OR), true);
  assert.deepEqual(
    (order.count.mock.calls[0] as { arguments: unknown[] }).arguments[0],
    { where },
  );
});

test('the smallest and largest allowed page sizes are accepted', async () => {
  for (const [pageSize, take] of [
    ['1', 1],
    ['100', 100],
  ] as const) {
    const { app, order, token } = await fixture();
    const response = await request(app)
      .get(`/api/admin/orders?page=1&pageSize=${pageSize}`)
      .auth(token, { type: 'bearer' });
    assert.equal(response.status, 200, pageSize);
    assert.equal(findManyArgs(order).take, take);
    assert.equal(response.body.pageSize, take);
  }
});

test('repeated query parameters are rejected instead of guessed at', async () => {
  const { app, order, token } = await fixture();
  for (const query of [
    'status=PENDING&status=SHIPPED',
    'sort=newest&sort=oldest',
    'search=a&search=b',
    'page=1&page=2',
  ]) {
    const response = await request(app)
      .get(`/api/admin/orders?${query}`)
      .auth(token, { type: 'bearer' });
    assert.equal(response.status, 400, query);
  }
  assert.equal(order.findMany.mock.callCount(), 0);
});

test('unrelated query parameters are ignored', async () => {
  const { app, order, token } = await fixture();
  const response = await request(app)
    .get('/api/admin/orders?foo=bar&customerId=someone-else')
    .auth(token, { type: 'bearer' });
  assert.equal(response.status, 200);
  assert.deepEqual(findManyArgs(order).where, {});
});

test('search passes wildcard and quote characters through as literal text', async () => {
  const { app, order, token } = await fixture();
  const response = await request(app)
    .get("/api/admin/orders?search=100%25_'%22%5C")
    .auth(token, { type: 'bearer' });
  assert.equal(response.status, 200);
  const where = findManyArgs(order).where as {
    OR: { AND: { OR: { first_name: { contains: string } }[] }[] }[];
  };
  assert.equal(where.OR[0]?.AND[0]?.OR[0]?.first_name.contains, '100%_\'"\\');
  // Not hex, so it is never treated as an order id prefix.
  assert.equal(where.OR.length, 1);
});

test('blank or partial checkout names fall back sensibly', async () => {
  const { app, token } = await fixture(
    [
      { ...fullOrder, first_name: '', last_name: '' },
      { ...fullOrder, first_name: 'Sam', last_name: null },
      { ...fullOrder, first_name: null, last_name: 'Jones' },
    ],
    3,
  );
  const response = await request(app)
    .get('/api/admin/orders')
    .auth(token, { type: 'bearer' });
  assert.deepEqual(
    response.body.orders.map((o: { customerName: string }) => o.customerName),
    ['Account Holder', 'Sam', 'Jones'],
  );
});

test('totals are rounded to whole pence without float drift', async () => {
  const totals: [number, number][] = [
    [0.29, 29],
    [1.15, 115],
    [4.35, 435],
    [19.99, 1999],
  ];
  const { app, token } = await fixture(
    totals.map(([order_total]) => ({ ...fullOrder, order_total })),
    totals.length,
  );
  const response = await request(app)
    .get('/api/admin/orders')
    .auth(token, { type: 'bearer' });
  assert.deepEqual(
    response.body.orders.map((o: { totalPence: number }) => o.totalPence),
    totals.map(([, pence]) => pence),
  );
});

test('customer service can read a single order', async () => {
  const { app, order, state, token } = await fixture();
  state.role = 'CUSTOMER_SERVICE';
  const response = await request(app)
    .get(`/api/admin/orders/${orderId}`)
    .auth(token, { type: 'bearer' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(
    (order.findUnique.mock.calls[0] as { arguments: { where: unknown }[] })
      .arguments[0]?.where,
    { id: orderId },
  );
});
