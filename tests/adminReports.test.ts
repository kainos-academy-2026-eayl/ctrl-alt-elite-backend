import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createAuthorization } from '../src/middleware/authorization_middleware';

const secret = 'test-only-secret-with-at-least-32-bytes';

interface Fixtures {
  statuses?: { order_status: string; _count: { _all: number } }[];
  units?: number | null;
  daily?: { date: string; orders: number | bigint; revenuePence: bigint }[];
  top?: {
    productId: string;
    name: string;
    unitsSold: bigint;
    revenuePence: bigint | null;
  }[];
}

async function fixture({
  statuses = [],
  units = null,
  daily = [],
  top = [],
}: Fixtures = {}) {
  const state = { role: 'ADMIN' };
  const sql: string[] = [];
  const params: unknown[][] = [];
  const transactionOptions: unknown[] = [];
  const order = {
    groupBy: mock.fn(async (_args: unknown) => statuses),
  };
  const orderProducts = {
    aggregate: mock.fn(async (_args: unknown) => ({ _sum: { amount: units } })),
  };
  // The tagged template passes the SQL fragments first, then the values.
  const queryRaw = mock.fn(async (strings: string[], ...values: unknown[]) => {
    const text = strings.join('?');
    sql.push(text);
    params.push(values);
    return text.includes('"order_products"') ? top : daily;
  });
  const tx = {
    order,
    order_products: orderProducts,
    $queryRaw: queryRaw,
  };
  const database = {
    user: { findUnique: async () => ({ role: state.role }) },
    $transaction: mock.fn(
      async (
        run: (transaction: typeof tx) => Promise<unknown>,
        options: unknown,
      ) => {
        transactionOptions.push(options);
        return run(tx);
      },
    ),
  } as unknown as PrismaClient;
  const { issueToken } = createAuthorization(database, secret);
  return {
    state,
    sql,
    params,
    transactionOptions,
    order,
    orderProducts,
    app: createApp(database, 'http://localhost:5500', secret),
    token: await issueToken('admin-1'),
  };
}

const sales = '/api/admin/reports/sales';

test('reports require a valid token', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { app } = await fixture();
  const missing = await request(app).get(
    `${sales}?from=2026-11-01&to=2026-11-05`,
  );
  assert.equal(missing.status, 401);
  assert.equal(missing.headers['cache-control'], 'no-store');
  const invalid = await request(app)
    .get(`${sales}?from=2026-11-01&to=2026-11-05`)
    .auth('bad', { type: 'bearer' });
  assert.equal(invalid.status, 401);
});

test('reports are denied to every non-admin role', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { app, state, token } = await fixture();
  for (const role of ['CUSTOMER', 'CUSTOMER_SERVICE', 'INVENTORY_MANAGEMENT']) {
    state.role = role;
    const response = await request(app)
      .get(`${sales}?from=2026-11-01&to=2026-11-05`)
      .auth(token, { type: 'bearer' });
    assert.equal(response.status, 403, role);
    assert.equal(response.headers['cache-control'], 'no-store');
  }
});

test('invalid ranges return 400 with a message', async () => {
  const { app, order, token } = await fixture();
  for (const query of [
    '',
    'from=2026-11-01',
    'to=2026-11-05',
    'from=2026-02-30&to=2026-03-05',
    'from=2026/11/01&to=2026-11-05',
    'from=2026-11-01&to=nope',
    'from=2026-11-05&to=2026-11-01',
    'from=2025-01-01&to=2026-01-02',
  ]) {
    const response = await request(app)
      .get(`${sales}?${query}`)
      .auth(token, { type: 'bearer' });
    assert.equal(response.status, 400, query);
    assert.equal(typeof response.body.message, 'string', query);
  }
  assert.equal(order.groupBy.mock.callCount(), 0);
});

test('the span limit is 366 days inclusive', async () => {
  const { app, token } = await fixture();
  // 2024 is a leap year: 2024-01-01 to 2024-12-31 is exactly 366 days.
  const ok = await request(app)
    .get(`${sales}?from=2024-01-01&to=2024-12-31`)
    .auth(token, { type: 'bearer' });
  assert.equal(ok.status, 200);
  const tooLong = await request(app)
    .get(`${sales}?from=2024-01-01&to=2025-01-01`)
    .auth(token, { type: 'bearer' });
  assert.equal(tooLong.status, 400);
});

test('a single-day range is valid', async () => {
  const { app, token } = await fixture();
  const response = await request(app)
    .get(`${sales}?from=2026-11-05&to=2026-11-05`)
    .auth(token, { type: 'bearer' });
  assert.equal(response.status, 200);
});

test('an empty range returns zeros and empty lists', async () => {
  const { app, token } = await fixture();
  const response = await request(app)
    .get(`${sales}?from=2026-11-01&to=2026-11-05`)
    .auth(token, { type: 'bearer' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.body, {
    range: { from: '2026-11-01', to: '2026-11-05' },
    summary: {
      totalOrders: 0,
      totalRevenuePence: 0,
      averageOrderValuePence: 0,
      unitsSold: 0,
    },
    ordersByStatus: [],
    dailySales: [],
    topProducts: [],
  });
});

test('the range is inclusive in UTC and every query uses the same bounds', async () => {
  const { app, order, orderProducts, params, token } = await fixture();
  await request(app)
    .get(`${sales}?from=2026-11-01&to=2026-11-05`)
    .auth(token, { type: 'bearer' });

  const start = new Date('2026-11-01T00:00:00.000Z');
  const endExclusive = new Date('2026-11-06T00:00:00.000Z');
  const groupBy = (order.groupBy.mock.calls[0] as { arguments: unknown[] })
    .arguments[0] as { where: { createdAt: unknown } };
  assert.deepEqual(groupBy.where.createdAt, { gte: start, lt: endExclusive });
  const aggregate = (
    orderProducts.aggregate.mock.calls[0] as { arguments: unknown[] }
  ).arguments[0] as { where: { order: { createdAt: unknown } } };
  assert.deepEqual(aggregate.where.order.createdAt, {
    gte: start,
    lt: endExclusive,
  });

  for (const values of params) {
    assert.deepEqual(values, [
      '2026-11-01 00:00:00.000',
      '2026-11-06 00:00:00.000',
    ]);
  }
});

test('all report queries use a repeatable-read transaction', async () => {
  const { app, transactionOptions, token } = await fixture();
  await request(app)
    .get(`${sales}?from=2026-11-01&to=2026-11-05`)
    .auth(token, { type: 'bearer' });

  assert.deepEqual(transactionOptions, [{ isolationLevel: 'RepeatableRead' }]);
});

test('cancelled orders are excluded from revenue, units and top products but not ordersByStatus', async () => {
  const { app, order, orderProducts, sql, token } = await fixture();
  await request(app)
    .get(`${sales}?from=2026-11-01&to=2026-11-05`)
    .auth(token, { type: 'bearer' });

  const groupBy = (order.groupBy.mock.calls[0] as { arguments: unknown[] })
    .arguments[0] as { where: Record<string, unknown> };
  assert.equal('order_status' in groupBy.where, false);

  const aggregate = (
    orderProducts.aggregate.mock.calls[0] as { arguments: unknown[] }
  ).arguments[0] as { where: { order: { order_status: unknown } } };
  assert.deepEqual(aggregate.where.order.order_status, { not: 'CANCELLED' });

  assert.equal(sql.length, 2);
  for (const text of sql) {
    assert.match(text, /<> 'CANCELLED'/);
  }
});

test('the report aggregates database rows into the contract shape', async () => {
  const { app, token } = await fixture({
    statuses: [
      { order_status: 'CANCELLED', _count: { _all: 1 } },
      { order_status: 'DELIVERED', _count: { _all: 1 } },
      { order_status: 'PENDING', _count: { _all: 2 } },
    ],
    units: 7,
    daily: [
      { date: '2026-11-02', orders: 1, revenuePence: 2500n },
      { date: '2026-11-04', orders: 2, revenuePence: 3500n },
    ],
    top: [
      {
        productId: 'p1',
        name: 'Desk Lamp',
        unitsSold: 4n,
        revenuePence: 4000n,
      },
      { productId: 'p2', name: 'Mug', unitsSold: 3n, revenuePence: 2000n },
    ],
  });
  const response = await request(app)
    .get(`${sales}?from=2026-11-01&to=2026-11-05`)
    .auth(token, { type: 'bearer' });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    range: { from: '2026-11-01', to: '2026-11-05' },
    summary: {
      totalOrders: 3,
      totalRevenuePence: 6000,
      averageOrderValuePence: 2000,
      unitsSold: 7,
    },
    ordersByStatus: [
      { status: 'PENDING', count: 2 },
      { status: 'DELIVERED', count: 1 },
      { status: 'CANCELLED', count: 1 },
    ],
    dailySales: [
      { date: '2026-11-02', orders: 1, revenuePence: 2500 },
      { date: '2026-11-04', orders: 2, revenuePence: 3500 },
    ],
    topProducts: [
      { productId: 'p1', name: 'Desk Lamp', unitsSold: 4, revenuePence: 4000 },
      { productId: 'p2', name: 'Mug', unitsSold: 3, revenuePence: 2000 },
    ],
  });
});

test('a range containing only cancelled orders has zero revenue and average', async () => {
  const { app, token } = await fixture({
    statuses: [{ order_status: 'CANCELLED', _count: { _all: 2 } }],
  });
  const response = await request(app)
    .get(`${sales}?from=2026-11-01&to=2026-11-05`)
    .auth(token, { type: 'bearer' });
  assert.equal(response.body.summary.totalOrders, 0);
  assert.equal(response.body.summary.averageOrderValuePence, 0);
  assert.deepEqual(response.body.ordersByStatus, [
    { status: 'CANCELLED', count: 2 },
  ]);
});

test('the average is rounded to whole pence', async () => {
  const { app, token } = await fixture({
    daily: [{ date: '2026-11-02', orders: 3, revenuePence: 1000n }],
  });
  const response = await request(app)
    .get(`${sales}?from=2026-11-01&to=2026-11-05`)
    .auth(token, { type: 'bearer' });
  assert.equal(response.body.summary.averageOrderValuePence, 333);
});

test('the top products query is limited to 10 and ordered by revenue', async () => {
  const { app, sql, token } = await fixture();
  await request(app)
    .get(`${sales}?from=2026-11-01&to=2026-11-05`)
    .auth(token, { type: 'bearer' });
  const top = sql.find((text) => text.includes('"order_products"')) ?? '';
  assert.match(top, /ORDER BY "revenuePence" DESC/);
  assert.match(top, /DESC NULLS LAST/);
  assert.match(top, /BOOL_OR\(o\."delivery_option" IS NULL\) THEN NULL/);
  assert.match(top, /LIMIT 10/);
});

test('migrated legacy order prices are reported as unknown', async () => {
  const { app, token } = await fixture({
    top: [
      {
        productId: 'legacy-product',
        name: 'Legacy Product',
        unitsSold: 2n,
        revenuePence: null,
      },
    ],
  });
  const response = await request(app)
    .get(`${sales}?from=2026-11-01&to=2026-11-05`)
    .auth(token, { type: 'bearer' });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.topProducts, [
    {
      productId: 'legacy-product',
      name: 'Legacy Product',
      unitsSold: 2,
      revenuePence: null,
    },
  ]);
});

test('leap days are real dates and other February 29ths are not', async () => {
  const { app, token } = await fixture();
  const ok = await request(app)
    .get(`${sales}?from=2024-02-29&to=2024-02-29`)
    .auth(token, { type: 'bearer' });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.range, { from: '2024-02-29', to: '2024-02-29' });
  const bad = await request(app)
    .get(`${sales}?from=2025-02-29&to=2025-03-01`)
    .auth(token, { type: 'bearer' });
  assert.equal(bad.status, 400);
});

test('a range ending on 31 December includes the whole day and stops at New Year', async () => {
  const { app, order, params, token } = await fixture();
  await request(app)
    .get(`${sales}?from=2026-12-31&to=2026-12-31`)
    .auth(token, { type: 'bearer' });
  const groupBy = (order.groupBy.mock.calls[0] as { arguments: unknown[] })
    .arguments[0] as { where: { createdAt: unknown } };
  assert.deepEqual(groupBy.where.createdAt, {
    gte: new Date('2026-12-31T00:00:00.000Z'),
    lt: new Date('2027-01-01T00:00:00.000Z'),
  });
  for (const values of params) {
    assert.deepEqual(values, [
      '2026-12-31 00:00:00.000',
      '2027-01-01 00:00:00.000',
    ]);
  }
});
