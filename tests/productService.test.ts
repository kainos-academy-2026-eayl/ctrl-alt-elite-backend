import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import type { PrismaClient } from '../src/generated/prisma/client';
import { Product } from '../src/models/product';
import { ProductService } from '../src/services/productService';

const records = [
  {
    id: 'sample-lamp',
    name: 'Desk Lamp',
    description: 'Adjustable LED lamp.',
    imageUrl: '/assets/images/placeholder.svg',
    unitPricePence: 2499,
    keywords: ['light', 'bedside'],
    isInStock: true,
  },
  {
    id: 'sample-mug',
    name: 'Ceramic Mug',
    description: 'Mug for tea and coffee.',
    imageUrl: '/assets/images/placeholder.svg',
    unitPricePence: 550,
    keywords: ['coffee'],
    isInStock: false,
  },
];

function createMockDatabase() {
  return {
    product: {
      findMany: mock.fn(async (_args: unknown) => records),
    },
  };
}

let database: ReturnType<typeof createMockDatabase>;
let service: ProductService;

beforeEach(() => {
  database = createMockDatabase();
  service = new ProductService(database as unknown as PrismaClient);
});

test('returns matching products from the catalogue as Product models', async () => {
  const result = await service.searchProducts('lamp');

  assert.equal(result.isClosestMatch, false);
  assert.equal(result.products.length, 1);
  const [lamp] = result.products;
  assert.ok(lamp instanceof Product);
  assert.equal(lamp.id, 'sample-lamp');
  assert.equal(lamp.price, '24.99');
});

test('loads the catalogue in catalogue order with only the needed fields', async () => {
  await service.searchProducts('lamp');

  assert.equal(database.product.findMany.mock.callCount(), 1);
  assert.deepEqual(database.product.findMany.mock.calls[0]?.arguments[0], {
    select: {
      id: true,
      name: true,
      description: true,
      imageUrl: true,
      unitPricePence: true,
      keywords: true,
      isInStock: true,
    },
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
  });
});

test('includes out of stock products', async () => {
  const result = await service.searchProducts('coffee');

  assert.deepEqual(
    result.products.map((p) => [p.id, p.isInStock]),
    [['sample-mug', false]],
  );
});

test('flags a closest match when a word was misspelled', async () => {
  const result = await service.searchProducts('lmap');

  assert.deepEqual(
    result.products.map((p) => p.id),
    ['sample-lamp'],
  );
  assert.equal(result.isClosestMatch, true);
});

test('returns nothing without querying the database for a blank term', async () => {
  const result = await service.searchProducts('   ');

  assert.deepEqual(result, { products: [], isClosestMatch: false });
  assert.equal(database.product.findMany.mock.callCount(), 0);
});
