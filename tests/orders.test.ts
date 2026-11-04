import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app';
import {
  InsufficientCreditError,
  InsufficientStockError,
  OrderProductNotFoundError,
} from '../src/errors/order_errors';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client';
import { createAuthorization } from '../src/middleware/authorization_middleware';
import {
  type CreateOrderInput,
  DELIVERY_OPTIONS,
  type Order,
  orderSchema,
} from '../src/models/order_model';
import { createOrderRepository } from '../src/repo/order_repository';

const secret = 'test-only-secret-with-at-least-32-bytes';
const customerId = 'customer-1';
const orderId = '6c0d342d-3f30-475d-8a13-2742cf09c105';
const lampId = '11111111-1111-4111-8111-111111111111';
const mugId = '22222222-2222-4222-8222-222222222222';
const express = DELIVERY_OPTIONS[1];

const validBody = {
  items: [
    { productId: mugId, quantity: 1 },
    { productId: lampId, quantity: 2 },
  ],
  customer: {
    firstName: ' Sam ',
    lastName: 'Jones',
    email: 'sam@example.com',
    phone: '07700 900-123',
  },
  address: {
    line1: '1 High Street',
    line2: '',
    town: 'Belfast',
    postcode: 'bt11aa',
  },
  deliveryOption: 'express',
};

const input: CreateOrderInput = orderSchema.parse(validBody);

const order: Order = {
  id: orderId,
  // 2 × £24.99 + 1 × £5.50 + £4.99 express delivery.
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
  products: [
    {
      product_id: mugId,
      amount: 1,
      unit_price_pence: 550,
      product: { name: 'Ceramic Mug' },
    },
    {
      product_id: lampId,
      amount: 2,
      unit_price_pence: 2499,
      product: { name: 'Desk Lamp' },
    },
  ],
};

const orderJson = {
  id: orderId,
  status: 'PENDING',
  createdAt: '2026-11-04T10:00:00.000Z',
  items: [
    {
      productId: mugId,
      name: 'Ceramic Mug',
      unitPricePence: 550,
      quantity: 1,
      lineTotalPence: 550,
    },
    {
      productId: lampId,
      name: 'Desk Lamp',
      unitPricePence: 2499,
      quantity: 2,
      lineTotalPence: 4998,
    },
  ],
  itemsTotalPence: 5548,
  deliveryPricePence: 499,
  totalPence: 6047,
  delivery: {
    id: 'express',
    name: 'Express delivery',
    description: '1–2 working days',
  },
  customer: {
    firstName: 'Sam',
    lastName: 'Jones',
    email: 'sam@example.com',
    phone: '07700900123',
  },
  address: {
    line1: '1 High Street',
    line2: null,
    town: 'Belfast',
    postcode: 'BT1 1AA',
  },
};
interface TxOptions {
  products?: { id: string; price: number; stock: number }[];
  stockUpdated?: number;
  creditCharged?: number;
  balanceAfter?: number;
}

function fakeTransaction({
  products = [
    { id: lampId, price: 24.99, stock: 5 },
    { id: mugId, price: 5.5, stock: 1 },
  ],
  stockUpdated = 1,
  creditCharged = 1,
  balanceAfter = 43953,
}: TxOptions = {}) {
  return {
    product: {
      findMany: mock.fn(async (_args: unknown) => products),
      updateMany: mock.fn(async (_args: unknown) => ({ count: stockUpdated })),
    },
    user: {
      updateMany: mock.fn(async (_args: unknown) => ({ count: creditCharged })),
      findUnique: mock.fn(async (_args: unknown) => ({
        creditBalancePence: balanceAfter,
      })),
    },
    order: { create: mock.fn(async (_args: unknown) => order) },
  };
}

function repositoryWith(tx: ReturnType<typeof fakeTransaction>) {
  const database = {
    $transaction: mock.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
    order: { findFirst: mock.fn(async () => order) },
    user: { findUnique: mock.fn(async () => null) },
  };
  return createOrderRepository(database as never);
}

test('orderSchema tidies the phone number, postcode and blank address line 2', () => {
  assert.equal(input.customer.firstName, 'Sam');
  assert.equal(input.customer.phone, '07700900123');
  assert.equal(input.address.postcode, 'BT1 1AA');
  assert.equal(input.address.line2, undefined);
});

test('orderSchema accepts UK phone numbers and stores them in national form', () => {
  for (const [phone, expected] of [
    ['07700 900-123', '07700900123'],
    ['+44 (0)7700 900123', '07700900123'],
    ['+447700900123', '07700900123'],
    ['028 9012 3456', '02890123456'],
  ] as const) {
    const parsed = orderSchema.parse({
      ...validBody,
      customer: { ...validBody.customer, phone },
    });
    assert.equal(parsed.customer.phone, expected, phone);
  }
  for (const phone of [
    '07700 9OO123',
    '0770090012',
    '+1 202 555 0123',
    '07700#900123',
  ]) {
    assert.equal(
      orderSchema.safeParse({
        ...validBody,
        customer: { ...validBody.customer, phone },
      }).success,
      false,
      phone,
    );
  }
});

test('orderSchema rejects unknown fields, duplicates and unknown delivery options', () => {
  for (const body of [
    { ...validBody, customerId: 'someone-else' },
    { ...validBody, totalPence: 1 },
    {
      ...validBody,
      items: [
        { productId: lampId, quantity: 1 },
        { productId: lampId, quantity: 1 },
      ],
    },
    { ...validBody, deliveryOption: 'rocket' },
    { ...validBody, address: { ...validBody.address, postcode: 'NOPE' } },
    { ...validBody, customer: { ...validBody.customer, phone: '12345' } },
    {
      ...validBody,
      customer: { ...validBody.customer, email: 'not-an-email' },
    },
  ]) {
    assert.equal(
      orderSchema.safeParse(body).success,
      false,
      JSON.stringify(body),
    );
  }
});

test('repository decrements stock in product order, charges credit and saves the order', async () => {
  const tx = fakeTransaction();
  const result = await repositoryWith(tx).create(customerId, input, express);

  assert.deepEqual(result, { order, creditBalancePence: 43953 });
  assert.deepEqual(
    tx.product.updateMany.mock.calls.map((call) => call.arguments[0]),
    [
      {
        where: { id: lampId, stock: { gte: 2 } },
        data: { stock: { decrement: 2 } },
      },
      {
        where: { id: mugId, stock: { gte: 1 } },
        data: { stock: { decrement: 1 } },
      },
    ],
  );
  // 2 × £24.99 + 1 × £5.50 + £4.99 express delivery.
  assert.deepEqual(tx.user.updateMany.mock.calls[0]?.arguments[0], {
    where: { id: customerId, creditBalancePence: { gte: 6047 } },
    data: { creditBalancePence: { decrement: 6047 } },
  });
  const created = tx.order.create.mock.calls[0]?.arguments[0] as {
    data: Record<string, unknown>;
  };
  assert.equal(created.data.customerId, customerId);
  assert.equal(created.data.order_total, 60.47);
  assert.equal(created.data.order_status, 'PENDING');
  assert.equal(created.data.postcode, 'BT1 1AA');
  assert.equal(created.data.delivery_option, 'express');
  assert.equal(created.data.delivery_price_pence, 499);
  assert.deepEqual(created.data.products, {
    create: [
      { product_id: lampId, amount: 2, unit_price_pence: 2499 },
      { product_id: mugId, amount: 1, unit_price_pence: 550 },
    ],
  });
});

test('repository rejects a missing product before changing anything', async () => {
  const tx = fakeTransaction({
    products: [{ id: lampId, price: 1, stock: 9 }],
  });
  await assert.rejects(
    repositoryWith(tx).create(customerId, input, express),
    OrderProductNotFoundError,
  );
  assert.equal(tx.product.updateMany.mock.callCount(), 0);
  assert.equal(tx.order.create.mock.callCount(), 0);
});

test('repository rejects too little stock, including when another order wins the race', async () => {
  const short = fakeTransaction({
    products: [
      { id: lampId, price: 24.99, stock: 1 },
      { id: mugId, price: 5.5, stock: 1 },
    ],
  });
  await assert.rejects(
    repositoryWith(short).create(customerId, input, express),
    InsufficientStockError,
  );

  const raced = fakeTransaction({ stockUpdated: 0 });
  await assert.rejects(
    repositoryWith(raced).create(customerId, input, express),
    InsufficientStockError,
  );
  assert.equal(raced.user.updateMany.mock.callCount(), 0);
  assert.equal(raced.order.create.mock.callCount(), 0);
});

test('repository rejects an order the credit balance cannot cover', async () => {
  const tx = fakeTransaction({ creditCharged: 0, balanceAfter: 1000 });
  await assert.rejects(
    repositoryWith(tx).create(customerId, input, express),
    new InsufficientCreditError(1000, 6047),
  );
  assert.equal(tx.order.create.mock.callCount(), 0);
  assert.equal(
    new InsufficientCreditError(1000, 6047).message,
    'Your credit balance of £10.00 is not enough to pay £60.47.',
  );
});

function fakeDatabase({
  tx = fakeTransaction(),
  ownOrder = order as Order | null,
  transactionError = null as unknown,
} = {}) {
  return {
    user: {
      findUnique: mock.fn(async (args: { select: Record<string, boolean> }) =>
        args.select.role
          ? { role: 'CUSTOMER' }
          : {
              firstName: 'Sam',
              lastName: 'Jones',
              email: 'sam@example.com',
              creditBalancePence: 43953,
            },
      ),
    },
    order: { findFirst: mock.fn(async (_args: unknown) => ownOrder) },
    $transaction: mock.fn(async (fn: (client: unknown) => unknown) => {
      if (transactionError) throw transactionError;
      return fn(tx);
    }),
  };
}

async function appWith(database: ReturnType<typeof fakeDatabase>) {
  const app = createApp(
    database as unknown as PrismaClient,
    'http://localhost:3000',
    secret,
  );
  const { issueToken } = createAuthorization(
    database as unknown as PrismaClient,
    secret,
  );
  return { app, auth: `Bearer ${await issueToken(customerId)}` };
}

test('GET /api/delivery-options lists the delivery choices without logging in', async () => {
  const { app } = await appWith(fakeDatabase());
  const response = await request(app).get('/api/delivery-options');

  assert.equal(response.status, 200);
  // Only personal account and order responses are marked no-store.
  assert.equal(response.headers['cache-control'], undefined);
  assert.deepEqual(
    response.body.deliveryOptions.map(
      (option: { id: string; description: string; pricePence: number }) => [
        option.id,
        option.description,
        option.pricePence,
      ],
    ),
    [
      ['standard', '3–5 working days', 0],
      ['express', '1–2 working days', 499],
      ['collection-1', '0.5 miles away', 0],
      ['collection-2', '1.2 miles away', 0],
      ['collection-3', '2.4 miles away', 0],
    ],
  );
});

test('GET /api/account needs a login and returns the credit balance', async () => {
  const { app, auth } = await appWith(fakeDatabase());

  assert.equal((await request(app).get('/api/account')).status, 401);
  const response = await request(app)
    .get('/api/account')
    .set('authorization', auth);
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.body, {
    account: {
      firstName: 'Sam',
      lastName: 'Jones',
      email: 'sam@example.com',
      creditBalancePence: 43953,
    },
  });
});

test('POST /api/orders places the order for the logged-in customer', async () => {
  const tx = fakeTransaction();
  const { app, auth } = await appWith(fakeDatabase({ tx }));
  const response = await request(app)
    .post('/api/orders')
    .set('authorization', auth)
    .send(validBody);

  assert.equal(response.status, 201);
  assert.equal(response.headers.location, `/api/orders/${orderId}`);
  assert.deepEqual(response.body, {
    order: orderJson,
    creditBalancePence: 43953,
  });
  const created = tx.order.create.mock.calls[0]?.arguments[0] as {
    data: { customerId: string };
  };
  assert.equal(created.data.customerId, customerId);
});

test('POST /api/orders rejects missing logins, non-JSON bodies and invalid details', async () => {
  const database = fakeDatabase();
  const { app, auth } = await appWith(database);

  assert.equal(
    (await request(app).post('/api/orders').send(validBody)).status,
    401,
  );
  const notJson = await request(app)
    .post('/api/orders')
    .set('authorization', auth)
    .type('form')
    .send('items=1');
  assert.equal(notJson.status, 415);
  const invalid = await request(app)
    .post('/api/orders')
    .set('authorization', auth)
    .send({ ...validBody, deliveryOption: 'rocket' });
  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.body.errors, [
    { field: 'deliveryOption', message: 'Choose a delivery option.' },
  ]);
  assert.equal(database.$transaction.mock.callCount(), 0);
});

test('POST /api/orders explains when the credit balance is too low', async () => {
  const tx = fakeTransaction({ creditCharged: 0, balanceAfter: 1000 });
  const { app, auth } = await appWith(fakeDatabase({ tx }));
  const response = await request(app)
    .post('/api/orders')
    .set('authorization', auth)
    .send(validBody);

  assert.equal(response.status, 409);
  assert.deepEqual(response.body, {
    message: 'Your credit balance of £10.00 is not enough to pay £60.47.',
  });
});

test('POST /api/orders asks the customer to retry after a transaction conflict', async () => {
  const conflict = new Prisma.PrismaClientKnownRequestError('conflict', {
    code: 'P2034',
    clientVersion: 'test',
  });
  const { app, auth } = await appWith(
    fakeDatabase({ transactionError: conflict }),
  );
  const errorLog = mock.method(console, 'error', () => {});
  try {
    const response = await request(app)
      .post('/api/orders')
      .set('authorization', auth)
      .send(validBody);
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, {
      message: 'Order could not be completed. Please try again.',
    });
  } finally {
    errorLog.mock.restore();
  }
});

test('GET /api/orders/:orderId only returns the customer’s own order', async () => {
  const database = fakeDatabase();
  const { app, auth } = await appWith(database);
  const response = await request(app)
    .get(`/api/orders/${orderId}`)
    .set('authorization', auth);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    order: orderJson,
    creditBalancePence: 43953,
  });
  const query = database.order.findFirst.mock.calls[0]?.arguments[0] as {
    where: unknown;
  };
  assert.deepEqual(query.where, { id: orderId, customerId });

  const { app: otherApp } = await appWith(fakeDatabase({ ownOrder: null }));
  const missing = await request(otherApp)
    .get(`/api/orders/${orderId}`)
    .set('authorization', auth);
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { message: 'Order not found.' });

  const badId = await request(app)
    .get('/api/orders/not-a-uuid')
    .set('authorization', auth);
  assert.equal(badId.status, 400);
});
