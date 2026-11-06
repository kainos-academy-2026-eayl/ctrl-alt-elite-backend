import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createAuthorization } from '../src/middleware/authorization_middleware';
import type { Order } from '../src/models/order_histroy_model';
import { createOrderHistoryRepository } from '../src/repo/order_history_repository';
import { createOrderHistoryService } from '../src/service/order_histroy_service';

const secret = 'test-only-secret-with-at-least-32-bytes';
const customerId = 'customer-1';
const otherCustomerId = 'customer-2';
const orderId = '6c0d342d-3f30-475d-8a13-2742cf09c105';
const productId = '11111111-1111-4111-8111-111111111111';

const customerOrder: Order = {
  id: orderId,
  customerId,
  createdAt: new Date('2026-11-04T10:00:00Z'),
  order_total: 49.98,
  order_status: 'PENDING',
  products: [{ product_id: productId, amount: 2 }],
};

function fakeDatabase(orders: Order[] = [customerOrder]) {
  const orderFindMany = mock.fn(async (args: unknown) => {
    const query = args as { where: { customerId: string } };
    return orders.filter(
      (order) => order.customerId === query.where.customerId,
    );
  });
  const orderFindFirst = mock.fn(async (args: unknown) => {
    const query = args as { where: { id: string; customerId: string } };
    return (
      orders.find(
        (order) =>
          order.id === query.where.id &&
          order.customerId === query.where.customerId,
      ) ?? null
    );
  });
  const userFindUnique = mock.fn(async () => ({ role: 'CUSTOMER' }));

  const database = {
    user: { findUnique: userFindUnique },
    order: { findMany: orderFindMany, findFirst: orderFindFirst },
  };

  return { database, orderFindMany, orderFindFirst };
}

test('repository only fetches the signed-in customer’s orders, newest first', async () => {
  const { database, orderFindMany } = fakeDatabase();
  const repository = createOrderHistoryRepository(database as never);

  const result = await repository.findAll(customerId);

  assert.deepEqual(result, [customerOrder]);
  assert.deepEqual(orderFindMany.mock.calls[0]?.arguments[0], {
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      customerId: true,
      createdAt: true,
      order_total: true,
      order_status: true,
      products: {
        select: { product_id: true, amount: true },
      },
    },
  });
});

test('repository scopes an individual order lookup to both order and customer IDs', async () => {
  const { database, orderFindFirst } = fakeDatabase();
  const repository = createOrderHistoryRepository(database as never);

  const result = await repository.findById(orderId, customerId);

  assert.deepEqual(result, customerOrder);
  assert.deepEqual(orderFindFirst.mock.calls[0]?.arguments[0], {
    where: { id: orderId, customerId },
    select: {
      id: true,
      customerId: true,
      createdAt: true,
      order_total: true,
      order_status: true,
      products: {
        select: { product_id: true, amount: true },
      },
    },
  });
});

test('service passes the customer ID to the repository', async () => {
  const calls: string[] = [];
  const repository = {
    async findAll(id: string) {
      calls.push(id);
      return [customerOrder];
    },
    async findById() {
      return null;
    },
  };
  const service = createOrderHistoryService(repository);

  assert.deepEqual(await service.getAll(customerId), [customerOrder]);
  assert.deepEqual(calls, [customerId]);
});

async function appWith(orders: Order[] = [customerOrder]) {
  const { database, orderFindMany } = fakeDatabase(orders);
  const prisma = database as unknown as PrismaClient;
  const app = createApp(prisma, 'http://localhost:3000', secret);
  const { issueToken } = createAuthorization(prisma, secret);
  return {
    app,
    auth: `Bearer ${await issueToken(customerId)}`,
    orderFindMany,
  };
}

test('GET /api/orders requires authentication', async () => {
  const { app } = await appWith();

  const response = await request(app).get('/api/orders');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { message: 'Authentication required.' });
});

test('GET /api/orders returns only the authenticated customer’s orders', async () => {
  const otherOrder: Order = {
    ...customerOrder,
    id: '7c0d342d-3f30-475d-8a13-2742cf09c105',
    customerId: otherCustomerId,
  };
  const { app, auth, orderFindMany } = await appWith([
    customerOrder,
    otherOrder,
  ]);

  const response = await request(app)
    .get('/api/orders')
    .set('authorization', auth);

  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.body, {
    orders: [
      { ...customerOrder, createdAt: customerOrder.createdAt.toISOString() },
    ],
  });
  assert.deepEqual(orderFindMany.mock.calls[0]?.arguments[0], {
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      customerId: true,
      createdAt: true,
      order_total: true,
      order_status: true,
      products: {
        select: { product_id: true, amount: true },
      },
    },
  });
});

test('GET /api/orders returns an empty list when the customer has no orders', async () => {
  const { app, auth } = await appWith([]);

  const response = await request(app)
    .get('/api/orders')
    .set('authorization', auth);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { orders: [] });
});
