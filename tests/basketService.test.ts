import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../src/errors/appErrors';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client';
import {
  BASKET_NOT_FOUND_MESSAGE,
  BasketService,
  ITEM_NOT_FOUND_MESSAGE,
  PRODUCT_NOT_FOUND_MESSAGE,
} from '../src/services/basketService';

const BASKET_ID = '6f1c2f0e-6a8e-4c43-9a51-3f3c9b8f4b11';

const lampRecord = {
  id: BASKET_ID,
  items: [
    {
      quantity: 2,
      product: { id: 'sample-lamp', name: 'Desk Lamp', unitPricePence: 2499 },
    },
  ],
};

function createMockDatabase() {
  return {
    $executeRaw: mock.fn(async (..._args: unknown[]) => 1),
    basket: {
      create: mock.fn(async () => ({ id: BASKET_ID, items: [] })),
      findUnique: mock.fn(async (): Promise<unknown> => lampRecord),
    },
    product: {
      findUnique: mock.fn(
        async (): Promise<unknown> => ({ name: 'Desk Lamp' }),
      ),
    },
    basketItem: {
      updateMany: mock.fn(async () => ({ count: 0 })),
      findUnique: mock.fn(async (): Promise<unknown> => null),
      create: mock.fn(async () => ({})),
      deleteMany: mock.fn(async () => ({ count: 1 })),
    },
  };
}

let database: ReturnType<typeof createMockDatabase>;
let service: BasketService;

beforeEach(() => {
  database = createMockDatabase();
  service = new BasketService(database as unknown as PrismaClient);
});

test('should create an empty basket', async () => {
  const basket = await service.createBasket();

  assert.equal(basket.id, BASKET_ID);
  assert.equal(basket.itemCount, 0);
});

test('should map basket items to lines with server-side prices', async () => {
  const basket = await service.getBasket(BASKET_ID);

  assert.equal(basket.lines[0]?.name, 'Desk Lamp');
  assert.equal(basket.lines[0]?.lineTotalPence, 4998);
  assert.equal(basket.totalPence, 4998);
});

test('should throw NotFoundError when the basket does not exist', async () => {
  database.basket.findUnique.mock.mockImplementation(async () => null);

  await assert.rejects(service.getBasket(BASKET_ID), {
    constructor: NotFoundError,
    message: BASKET_NOT_FOUND_MESSAGE,
  });
});

test('should create a new line with quantity 1 for a new product', async () => {
  const { isNewLine } = await service.addItem(BASKET_ID, 'sample-lamp');

  assert.equal(isNewLine, true);
  assert.deepEqual(database.basketItem.create.mock.calls[0]?.arguments, [
    { data: { basketId: BASKET_ID, productId: 'sample-lamp', quantity: 1 } },
  ]);
});

test('should increment an existing line below the maximum', async () => {
  database.basketItem.updateMany.mock.mockImplementation(async () => ({
    count: 1,
  }));

  const { isNewLine } = await service.addItem(BASKET_ID, 'sample-lamp');

  assert.equal(isNewLine, false);
  assert.deepEqual(database.basketItem.updateMany.mock.calls[0]?.arguments, [
    {
      where: {
        basketId: BASKET_ID,
        productId: 'sample-lamp',
        quantity: { lt: 99 },
      },
      data: { quantity: { increment: 1 } },
    },
  ]);
  assert.equal(database.basketItem.create.mock.callCount(), 0);
});

test('should throw ConflictError when the line is already at the maximum', async () => {
  database.basketItem.findUnique.mock.mockImplementation(async () => ({
    quantity: 99,
  }));

  await assert.rejects(service.addItem(BASKET_ID, 'sample-lamp'), {
    constructor: ConflictError,
    message: 'You already have the maximum of 99 × Desk Lamp in your basket',
  });
});

test('should throw ValidationError when the product is not in the catalogue', async () => {
  database.product.findUnique.mock.mockImplementation(async () => null);

  await assert.rejects(service.addItem(BASKET_ID, 'unknown'), {
    constructor: ValidationError,
    errors: [{ field: 'productId', message: PRODUCT_NOT_FOUND_MESSAGE }],
  });
});

test('should throw NotFoundError when adding to a missing basket', async () => {
  database.basket.findUnique.mock.mockImplementation(async () => null);

  await assert.rejects(service.addItem(BASKET_ID, 'sample-lamp'), {
    constructor: NotFoundError,
    message: BASKET_NOT_FOUND_MESSAGE,
  });
  assert.equal(database.basketItem.create.mock.callCount(), 0);
});

test('should increment instead when a simultaneous add created the line first', async () => {
  database.basketItem.create.mock.mockImplementation(async () => {
    throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
    });
  });
  database.basketItem.updateMany.mock.mockImplementationOnce(
    async () => ({ count: 1 }),
    1,
  );

  const { isNewLine } = await service.addItem(BASKET_ID, 'sample-lamp');

  assert.equal(isNewLine, false);
  assert.equal(database.basketItem.updateMany.mock.callCount(), 2);
});

test('should set the quantity of a line in the basket', async () => {
  database.basketItem.updateMany.mock.mockImplementation(async () => ({
    count: 1,
  }));

  await service.updateItemQuantity(BASKET_ID, 'sample-lamp', { quantity: 5 });

  assert.deepEqual(database.basketItem.updateMany.mock.calls[0]?.arguments, [
    {
      where: { basketId: BASKET_ID, productId: 'sample-lamp' },
      data: { quantity: 5 },
    },
  ]);
});

test('should throw NotFoundError when updating an item not in the basket', async () => {
  await assert.rejects(
    service.updateItemQuantity(BASKET_ID, 'sample-mug', { quantity: 2 }),
    {
      constructor: NotFoundError,
      message: ITEM_NOT_FOUND_MESSAGE,
    },
  );
});

test('should apply a +/- change in one clamped database update', async () => {
  await service.updateItemQuantity(BASKET_ID, 'sample-lamp', { change: -1 });

  const [sql, ...values] = database.$executeRaw.mock.calls[0]?.arguments ?? [];
  assert.match(
    (sql as string[]).join('?'),
    /LEAST\(GREATEST\("quantity" \+ \?::int, 1\), \?::int\)/,
  );
  assert.deepEqual(values, [-1, 99, BASKET_ID, 'sample-lamp']);
  assert.equal(database.basketItem.updateMany.mock.callCount(), 0);
});

test('should throw NotFoundError when changing an item not in the basket', async () => {
  database.$executeRaw.mock.mockImplementation(async () => 0);

  await assert.rejects(
    service.updateItemQuantity(BASKET_ID, 'sample-mug', { change: 1 }),
    { constructor: NotFoundError, message: ITEM_NOT_FOUND_MESSAGE },
  );
});

test('should remove a line from the basket', async () => {
  await service.removeItem(BASKET_ID, 'sample-lamp');

  assert.deepEqual(database.basketItem.deleteMany.mock.calls[0]?.arguments, [
    { where: { basketId: BASKET_ID, productId: 'sample-lamp' } },
  ]);
});

test('should throw NotFoundError when removing an item not in the basket', async () => {
  database.basketItem.deleteMany.mock.mockImplementation(async () => ({
    count: 0,
  }));

  await assert.rejects(service.removeItem(BASKET_ID, 'sample-mug'), {
    constructor: NotFoundError,
    message: ITEM_NOT_FOUND_MESSAGE,
  });
});

test('should report a missing basket rather than a missing item', async () => {
  database.basketItem.deleteMany.mock.mockImplementation(async () => ({
    count: 0,
  }));
  database.basket.findUnique.mock.mockImplementation(async () => null);

  await assert.rejects(service.removeItem(BASKET_ID, 'sample-mug'), {
    constructor: NotFoundError,
    message: BASKET_NOT_FOUND_MESSAGE,
  });
});
