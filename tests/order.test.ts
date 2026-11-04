//import { rejects } from 'node:assert';
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { OrderValidationError } from '../src/errors/order_errors';
import type { Order } from '../src/models/order_model';
import type { OrderRepository } from '../src/repo/order_repository';
import { createOrderService } from '../src/service/order_service';

const customerId = 'customer-1';
const productId = '11111111-1111-4111-8111-111111111111';

const validBody = {
  items: [{ productId, quantity: 2 }],
};

function fixture() {
  const savedOrder: Order = {
    id: 'order-1',
    customerId,
    products: [{ product_id: productId, amount: 2 }],
  };

  const create = mock.fn<OrderRepository['create']>(async () => savedOrder);

  const service = createOrderService({ create });

  return { service, create, savedOrder };
}

test('passes valid order details to the repository', async () => {
  const { service, create, savedOrder } = fixture();

  const result = await service.create(customerId, validBody);

  assert.deepEqual(result, savedOrder);
  assert.equal(create.mock.callCount(), 1);
  assert.deepEqual(create.mock.calls[0]?.arguments, [customerId, validBody]);
});

test('rejects empty items without calling the repository', async () => {
  const { service, create } = fixture();

  await assert.rejects(
    service.create(customerId, { items: [] }),
    OrderValidationError,
  );

  assert.equal(create.mock.callCount(), 0);
});

test('rejects items with non-positive quantity without calling the repository', async () => {
  const { service, create } = fixture();

  await assert.rejects(
    service.create(customerId, { items: [{ productId, quantity: 0 }] }),
    OrderValidationError,
  );

  assert.equal(create.mock.callCount(), 0);
});

test('rejects items with missing productId without calling the repository', async () => {
  const { service, create } = fixture();

  await assert.rejects(
    service.create(customerId, { items: [{ quantity: 2 }] }),
    OrderValidationError,
  );

  assert.equal(create.mock.callCount(), 0);
});

test('rejects items with missing quantity without calling the repository', async () => {
  const { service, create } = fixture();

  await assert.rejects(
    service.create(customerId, { items: [{ productId }] }),
    OrderValidationError,
  );

  assert.equal(create.mock.callCount(), 0);
});

test('rejects items with non-string productId without calling the repository', async () => {
  const { service, create } = fixture();

  await assert.rejects(
    service.create(customerId, { items: [{ productId: 123, quantity: 2 }] }),
    OrderValidationError,
  );

  assert.equal(create.mock.callCount(), 0);
});

test('rejects items with non-integer quantity without calling the repository', async () => {
  const { service, create } = fixture();

  await assert.rejects(
    service.create(customerId, { items: [{ productId, quantity: 2.5 }] }),
    OrderValidationError,
  );

  assert.equal(create.mock.callCount(), 0);
});

test('rejects items with a factional quantity without calling the repository', async () => {
  const { service, create } = fixture();

  await assert.rejects(
    service.create(customerId, { items: [{ productId, quantity: 1.5 }] }),
    OrderValidationError,
  );

  assert.equal(create.mock.callCount(), 0);
});

test('rejects order if same product is listed twice without calling the repository', async () => {
  const { service, create } = fixture();

  await assert.rejects(
    service.create(customerId, {
      items: [
        { productId, quantity: 2 },
        { productId, quantity: 3 },
      ],
    }),
    OrderValidationError,
  );

  assert.equal(create.mock.callCount(), 0);
});
