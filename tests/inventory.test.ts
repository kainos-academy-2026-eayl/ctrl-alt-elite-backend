import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client';
import { createAuthorization } from '../src/middleware/authorization_middleware';

const secret = 'test-only-secret-with-at-least-32-bytes';

interface Row {
  id: string;
  name: string;
  category: string;
  stock: number;
  lowStockThreshold: number;
  outOfStock: boolean;
}

async function fixture(role = 'INVENTORY_MANAGEMENT') {
  const state = { role };
  const rows: Row[] = [
    row('p-1', 'Lamp', 50, 10),
    row('p-2', 'Mug', 8, 10),
    row('p-3', 'Pen', 2, 2),
    row('p-4', 'Bag', 0, 10),
    { ...row('p-5', 'Hat', 40, 10), outOfStock: true },
  ];
  const user = {
    findUnique: async () => ({
      id: 'staff-1',
      firstName: 'Ivy',
      lastName: 'Stock',
      email: 'ivy@company.com',
      role: state.role,
    }),
    findMany: async () => [],
    count: async () => 0,
    findFirst: async () => null,
  };
  const product = {
    findMany: async () => rows.map((r) => ({ ...r })),
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<Row>;
    }) => {
      const target = rows.find((r) => r.id === where.id);
      if (!target) {
        throw new Prisma.PrismaClientKnownRequestError('missing', {
          code: 'P2025',
          clientVersion: 'test',
        });
      }
      Object.assign(target, data);
      return { ...target };
    },
  };
  const database = {
    user,
    product,
    supportTicket: { findMany: async () => [] },
    $transaction: async (queries: unknown[]) => Promise.all(queries),
  } as unknown as PrismaClient;
  const { issueToken } = createAuthorization(database, secret);
  return {
    state,
    rows,
    app: createApp(database, 'http://localhost:5500', secret),
    token: await issueToken('staff-1'),
  };
}

function row(id: string, name: string, stock: number, threshold: number): Row {
  return {
    id,
    name,
    category: 'Test',
    stock,
    lowStockThreshold: threshold,
    outOfStock: false,
  };
}

test('the inventory dashboard summarises stock and lists low-stock products', async () => {
  const { app, token } = await fixture();
  const response = await request(app)
    .get('/api/admin/inventory/dashboard')
    .auth(token, { type: 'bearer' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.summary, {
    totalProducts: 5,
    inStock: 1,
    lowStock: 4,
    outOfStock: 2,
    totalUnits: 100,
  });
  assert.deepEqual(
    response.body.lowStockProducts.map((p: { name: string }) => p.name),
    ['Bag', 'Pen', 'Mug', 'Hat'],
  );
});

test('inventory listing shows stock levels with a per-product status', async () => {
  const { app, token } = await fixture();
  const response = await request(app)
    .get('/api/admin/inventory')
    .auth(token, { type: 'bearer' });
  assert.equal(response.status, 200);
  const statuses = Object.fromEntries(
    response.body.products.map((p: { name: string; status: string }) => [
      p.name,
      p.status,
    ]),
  );
  assert.deepEqual(statuses, {
    Lamp: 'IN_STOCK',
    Mug: 'LOW_STOCK',
    Pen: 'LOW_STOCK',
    Bag: 'OUT_OF_STOCK',
    Hat: 'OUT_OF_STOCK',
  });
  assert.equal(response.body.products[0].image, undefined);
});

test('the low-stock endpoint highlights only products at or below their own threshold', async () => {
  const { app, token } = await fixture();
  const response = await request(app)
    .get('/api/admin/inventory/low-stock')
    .auth(token, { type: 'bearer' });
  assert.equal(response.status, 200);
  assert.ok(
    response.body.products.every((p: { lowStock: boolean }) => p.lowStock),
  );
  assert.ok(
    !response.body.products.some((p: { name: string }) => p.name === 'Lamp'),
  );
});

test('stock quantity and threshold can be updated and are saved', async () => {
  const { app, token, rows } = await fixture();
  const response = await request(app)
    .patch('/api/admin/inventory/p-2/stock')
    .auth(token, { type: 'bearer' })
    .send({ stock: 100, lowStockThreshold: 20 });
  assert.equal(response.status, 200);
  assert.equal(response.body.product.stock, 100);
  assert.equal(response.body.product.status, 'IN_STOCK');
  assert.equal(rows[1]?.stock, 100);
  assert.equal(rows[1]?.lowStockThreshold, 20);
});

test('products can be marked out of stock and restored', async () => {
  const { app, token, rows } = await fixture();
  const marked = await request(app)
    .patch('/api/admin/inventory/p-1/out-of-stock')
    .auth(token, { type: 'bearer' })
    .send({ outOfStock: true });
  assert.equal(marked.status, 200);
  assert.equal(marked.body.product.status, 'OUT_OF_STOCK');
  assert.equal(rows[0]?.outOfStock, true);

  const restored = await request(app)
    .patch('/api/admin/inventory/p-1/out-of-stock')
    .auth(token, { type: 'bearer' })
    .send({ outOfStock: false });
  assert.equal(restored.body.product.status, 'IN_STOCK');
});

test('invalid stock updates are rejected and nothing is saved', async () => {
  const { app, token, rows } = await fixture();
  for (const body of [
    { stock: -1 },
    { stock: 1.5 },
    { stock: '5' },
    { stock: 2_000_000 },
    { stock: 5, lowStockThreshold: -2 },
    {},
  ]) {
    const response = await request(app)
      .patch('/api/admin/inventory/p-1/stock')
      .auth(token, { type: 'bearer' })
      .send(body);
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.equal(rows[0]?.stock, 50);

  const negative = await request(app)
    .patch('/api/admin/inventory/p-1/stock')
    .auth(token, { type: 'bearer' })
    .send({ stock: -1, lowStockThreshold: -5 });
  assert.deepEqual(negative.body.errors, [
    { field: 'stock', message: 'Stock cannot be negative.' },
    {
      field: 'lowStockThreshold',
      message: 'Low stock threshold cannot be negative.',
    },
  ]);

  const notANumber = await request(app)
    .patch('/api/admin/inventory/p-1/stock')
    .auth(token, { type: 'bearer' })
    .send({ stock: '-' });
  assert.deepEqual(notANumber.body.errors, [
    { field: 'stock', message: 'Stock must be a number.' },
  ]);

  const flag = await request(app)
    .patch('/api/admin/inventory/p-1/out-of-stock')
    .auth(token, { type: 'bearer' })
    .send({ outOfStock: 'yes' });
  assert.equal(flag.status, 400);
});

test('updating an unknown product returns 404', async () => {
  const { app, token } = await fixture();
  const response = await request(app)
    .patch('/api/admin/inventory/missing/stock')
    .auth(token, { type: 'bearer' })
    .send({ stock: 5 });
  assert.equal(response.status, 404);
});

test('an inventory manager can use shared staff endpoints but not other areas', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { app, token } = await fixture();
  const profile = await request(app)
    .get('/api/admin/profile')
    .auth(token, { type: 'bearer' });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.role, 'INVENTORY_MANAGEMENT');

  const attempts = [
    request(app).get('/api/admin/customers'),
    request(app).get('/api/customers'),
    request(app).get('/api/admin/customers/c-1'),
    request(app).put('/api/admin/customers/c-1').send({}),
    request(app).put('/api/admin/customers/c-1/password').send({}),
    request(app).get('/api/admin/support/tickets'),
    request(app).get('/api/admin/products'),
    request(app).post('/api/admin/products').send({}),
    request(app).delete('/api/admin/products/p-1'),
    request(app).get('/api/admin/reports'),
    request(app).get('/api/admin/settings'),
    request(app).get('/api/admin/staff'),
  ];
  for (const attempt of attempts) {
    const response = await attempt.auth(token, { type: 'bearer' });
    assert.equal(response.status, 403);
  }
});

test('admins can use the inventory routes', async () => {
  const { app, token } = await fixture('ADMIN');
  const response = await request(app)
    .get('/api/admin/inventory/dashboard')
    .auth(token, { type: 'bearer' });
  assert.equal(response.status, 200);
});

test('customer service and customers are denied inventory access', async (context) => {
  context.mock.method(console, 'warn', () => {});
  for (const role of ['CUSTOMER_SERVICE', 'CUSTOMER']) {
    const { app, token } = await fixture(role);
    for (const attempt of [
      request(app).get('/api/admin/inventory'),
      request(app).get('/api/admin/inventory/dashboard'),
      request(app).get('/api/admin/inventory/low-stock'),
      request(app).patch('/api/admin/inventory/p-1/stock').send({ stock: 1 }),
      request(app)
        .patch('/api/admin/inventory/p-1/out-of-stock')
        .send({ outOfStock: true }),
    ]) {
      const response = await attempt.auth(token, { type: 'bearer' });
      assert.equal(response.status, 403, role);
    }
  }
});

test('inventory routes reject unauthenticated requests with 401', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { app } = await fixture();
  assert.equal((await request(app).get('/api/admin/inventory')).status, 401);
  assert.equal(
    (
      await request(app)
        .patch('/api/admin/inventory/p-1/stock')
        .send({ stock: 1 })
    ).status,
    401,
  );
});

test('a role change applies to inventory access on the next request', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { app, state, token } = await fixture();
  const get = () =>
    request(app).get('/api/admin/inventory').auth(token, { type: 'bearer' });
  assert.equal((await get()).status, 200);
  state.role = 'CUSTOMER_SERVICE';
  assert.equal((await get()).status, 403);
});
