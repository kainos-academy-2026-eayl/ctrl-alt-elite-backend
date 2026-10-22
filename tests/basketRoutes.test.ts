import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { ConflictError, NotFoundError } from '../src/errors/appErrors';
import type { PrismaClient } from '../src/generated/prisma/client';
import { Basket, BasketLine } from '../src/models/basket';
import type { BasketService } from '../src/services/basketService';

const BASKET_ID = '6f1c2f0e-6a8e-4c43-9a51-3f3c9b8f4b11';
const basket = new Basket(BASKET_ID, [
  new BasketLine('sample-lamp', 'Desk Lamp', 2499, 2),
  new BasketLine('sample-mug', 'Ceramic Mug', 550, 1),
]);
const expectedBasketBody = {
  id: BASKET_ID,
  items: [
    {
      id: 'sample-lamp',
      name: 'Desk Lamp',
      unitPricePence: 2499,
      quantity: 2,
      lineTotalPence: 4998,
    },
    {
      id: 'sample-mug',
      name: 'Ceramic Mug',
      unitPricePence: 550,
      quantity: 1,
      lineTotalPence: 550,
    },
  ],
  itemCount: 3,
  totalPence: 5548,
  maxQuantity: 99,
};

function createMockBasketService() {
  return {
    createBasket: mock.fn(async () => new Basket(BASKET_ID, [])),
    getBasket: mock.fn(async (_basketId: string) => basket),
    addItem: mock.fn(async (_basketId: string, _productId: string) => ({
      basket,
      isNewLine: true,
    })),
    updateItemQuantity: mock.fn(
      async (_basketId: string, _productId: string, _update: unknown) => basket,
    ),
    removeItem: mock.fn(
      async (_basketId: string, _productId: string): Promise<void> => {},
    ),
  };
}

let basketService: ReturnType<typeof createMockBasketService>;
let app: Express;

beforeEach(() => {
  basketService = createMockBasketService();
  app = createApp(
    {} as PrismaClient,
    'http://localhost:3000',
    'test-only-secret-with-at-least-32-bytes',
    { basketService: basketService as unknown as BasketService },
  );
});

test('POST /api/baskets should return 201 with an empty basket', async () => {
  const response = await request(app).post('/api/baskets');

  assert.equal(response.status, 201);
  assert.equal(response.headers.location, `/api/baskets/${BASKET_ID}`);
  assert.deepEqual(response.body, {
    id: BASKET_ID,
    items: [],
    itemCount: 0,
    totalPence: 0,
    maxQuantity: 99,
  });
});

test('GET /api/baskets/:basketId should return lines and totals', async () => {
  const response = await request(app).get(`/api/baskets/${BASKET_ID}`);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, expectedBasketBody);
});

test('GET /api/baskets/:basketId should return 400 for an invalid id', async () => {
  const response = await request(app).get('/api/baskets/not-a-uuid');

  assert.equal(response.status, 400);
  assert.deepEqual(response.body.errors, [
    { field: 'basketId', message: 'Basket id must be a valid UUID.' },
  ]);
  assert.equal(basketService.getBasket.mock.callCount(), 0);
});

test('GET /api/baskets/:basketId should return 404 when not found', async () => {
  basketService.getBasket.mock.mockImplementation(async () => {
    throw new NotFoundError('Basket not found. Please start a new basket.');
  });

  const response = await request(app).get(`/api/baskets/${BASKET_ID}`);

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, {
    message: 'Basket not found. Please start a new basket.',
  });
});

test('POST /items should return 201 when a new line is added', async () => {
  const response = await request(app)
    .post(`/api/baskets/${BASKET_ID}/items`)
    .send({ productId: ' sample-lamp ' });

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, expectedBasketBody);
  assert.deepEqual(basketService.addItem.mock.calls[0]?.arguments, [
    BASKET_ID,
    'sample-lamp',
  ]);
});

test('POST /items should return 200 when an existing line is incremented', async () => {
  basketService.addItem.mock.mockImplementation(async () => ({
    basket,
    isNewLine: false,
  }));

  const response = await request(app)
    .post(`/api/baskets/${BASKET_ID}/items`)
    .send({ productId: 'sample-lamp' });

  assert.equal(response.status, 200);
});

test('POST /items should ignore a client-supplied name and price', async () => {
  await request(app)
    .post(`/api/baskets/${BASKET_ID}/items`)
    .send({ productId: 'sample-lamp', name: 'Free Lamp', price: '0.01' });

  assert.deepEqual(basketService.addItem.mock.calls[0]?.arguments, [
    BASKET_ID,
    'sample-lamp',
  ]);
});

test('POST /items should return 400 when productId is missing', async () => {
  const response = await request(app)
    .post(`/api/baskets/${BASKET_ID}/items`)
    .send({});

  assert.equal(response.status, 400);
  assert.equal(response.body.errors[0].field, 'productId');
  assert.equal(basketService.addItem.mock.callCount(), 0);
});

test('POST /items should return 409 at the maximum quantity', async () => {
  const message =
    'You already have the maximum of 99 × Desk Lamp in your basket';
  basketService.addItem.mock.mockImplementation(async () => {
    throw new ConflictError(message);
  });

  const response = await request(app)
    .post(`/api/baskets/${BASKET_ID}/items`)
    .send({ productId: 'sample-lamp' });

  assert.equal(response.status, 409);
  assert.deepEqual(response.body, { message });
});

test('POST /items should return 415 without a JSON body', async () => {
  const response = await request(app)
    .post(`/api/baskets/${BASKET_ID}/items`)
    .type('form')
    .send('productId=sample-lamp');

  assert.equal(response.status, 415);
});

test('PATCH /items/:productId should update the quantity', async () => {
  const response = await request(app)
    .patch(`/api/baskets/${BASKET_ID}/items/sample-lamp`)
    .send({ quantity: 2 });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, expectedBasketBody);
  assert.deepEqual(basketService.updateItemQuantity.mock.calls[0]?.arguments, [
    BASKET_ID,
    'sample-lamp',
    { quantity: 2 },
  ]);
});

test('PATCH /items/:productId should accept a +/- change like the frontend', async () => {
  const response = await request(app)
    .patch(`/api/baskets/${BASKET_ID}/items/sample-lamp`)
    .send({ change: -1 });

  assert.equal(response.status, 200);
  assert.deepEqual(basketService.updateItemQuantity.mock.calls[0]?.arguments, [
    BASKET_ID,
    'sample-lamp',
    { change: -1 },
  ]);
});

test('PATCH /items/:productId should return 400 for an invalid change', async () => {
  for (const change of [0, 1.5, 100, '1']) {
    const response = await request(app)
      .patch(`/api/baskets/${BASKET_ID}/items/sample-lamp`)
      .send({ change });

    assert.equal(response.status, 400, `change ${String(change)}`);
    assert.equal(response.body.errors[0].field, 'change');
  }
  assert.equal(basketService.updateItemQuantity.mock.callCount(), 0);
});

test('PATCH /items/:productId should return 400 unless exactly one of quantity or change is sent', async () => {
  for (const body of [{}, { quantity: 2, change: 1 }]) {
    const response = await request(app)
      .patch(`/api/baskets/${BASKET_ID}/items/sample-lamp`)
      .send(body);

    assert.equal(response.status, 400);
    assert.deepEqual(response.body.errors, [
      {
        field: 'body',
        message: 'Send either quantity or change, but not both.',
      },
    ]);
  }
});

test('PATCH /items/:productId should return 400 for out-of-range quantities', async () => {
  for (const quantity of [0, 100, 2.5, '2', null]) {
    const response = await request(app)
      .patch(`/api/baskets/${BASKET_ID}/items/sample-lamp`)
      .send({ quantity });

    assert.equal(response.status, 400, `quantity ${String(quantity)}`);
    assert.deepEqual(response.body.errors, [
      {
        field: 'quantity',
        message: 'Quantity must be a whole number from 1 to 99.',
      },
    ]);
  }
  assert.equal(basketService.updateItemQuantity.mock.callCount(), 0);
});

test('DELETE /items/:productId should return 204', async () => {
  const response = await request(app).delete(
    `/api/baskets/${BASKET_ID}/items/sample-lamp`,
  );

  assert.equal(response.status, 204);
  assert.deepEqual(basketService.removeItem.mock.calls[0]?.arguments, [
    BASKET_ID,
    'sample-lamp',
  ]);
});

test('DELETE /items/:productId should return 404 when the item is missing', async () => {
  basketService.removeItem.mock.mockImplementation(async () => {
    throw new NotFoundError('That item is not in your basket.');
  });

  const response = await request(app).delete(
    `/api/baskets/${BASKET_ID}/items/sample-mug`,
  );

  assert.equal(response.status, 404);
});

test('should return a generic 500 without internal details', async () => {
  basketService.getBasket.mock.mockImplementation(async () => {
    throw new Error('database password leaked in stack');
  });
  mock.method(console, 'error', () => {});

  const response = await request(app).get(`/api/baskets/${BASKET_ID}`);

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    message: 'Unable to complete the request.',
  });
});
