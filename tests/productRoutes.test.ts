import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import type { PrismaClient } from '../src/generated/prisma/client';
import { Product } from '../src/models/product';
import type { ProductSearchResult } from '../src/models/productSearch';
import type { BasketService } from '../src/services/basketService';
import type { ProductService } from '../src/services/productService';

const lamp = new Product({
  id: 'sample-lamp',
  name: 'Desk Lamp',
  description: 'Adjustable LED lamp.',
  imageUrl: '/assets/images/placeholder.svg',
  unitPricePence: 2499,
  keywords: ['light', 'bedside'],
  isInStock: true,
});

function createMockProductService() {
  return {
    searchProducts: mock.fn(
      async (_searchTerm: string): Promise<ProductSearchResult> => ({
        products: [lamp],
        isClosestMatch: false,
      }),
    ),
  };
}

let productService: ReturnType<typeof createMockProductService>;
let app: Express;

beforeEach(() => {
  productService = createMockProductService();
  app = createApp({} as PrismaClient, 'http://localhost:3000', {
    basketService: {} as BasketService,
    productService: productService as unknown as ProductService,
  });
});

test('GET /api/products/search should return matching products', async () => {
  const response = await request(app).get('/api/products/search?q=lamp');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    searchTerm: 'lamp',
    isClosestMatch: false,
    products: [
      {
        id: 'sample-lamp',
        name: 'Desk Lamp',
        description: 'Adjustable LED lamp.',
        imageUrl: '/assets/images/placeholder.svg',
        price: '24.99',
        keywords: ['light', 'bedside'],
        isInStock: true,
      },
    ],
  });
  assert.equal(
    productService.searchProducts.mock.calls[0]?.arguments[0],
    'lamp',
  );
});

test('GET /api/products/search should trim the term before searching', async () => {
  const response = await request(app)
    .get('/api/products/search')
    .query({ q: '  desk lamp  ' });

  assert.equal(response.status, 200);
  assert.equal(response.body.searchTerm, 'desk lamp');
  assert.equal(
    productService.searchProducts.mock.calls[0]?.arguments[0],
    'desk lamp',
  );
});

test('GET /api/products/search should pass on the closest match flag', async () => {
  productService.searchProducts.mock.mockImplementation(async () => ({
    products: [lamp],
    isClosestMatch: true,
  }));

  const response = await request(app).get('/api/products/search?q=lmap');

  assert.equal(response.status, 200);
  assert.equal(response.body.isClosestMatch, true);
});

test('GET /api/products/search should treat a missing term as blank', async () => {
  productService.searchProducts.mock.mockImplementation(async () => ({
    products: [],
    isClosestMatch: false,
  }));

  const response = await request(app).get('/api/products/search');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    searchTerm: '',
    isClosestMatch: false,
    products: [],
  });
  assert.equal(productService.searchProducts.mock.calls[0]?.arguments[0], '');
});

test('GET /api/products/search should cut a long term to 100 characters, like the frontend', async () => {
  const response = await request(app)
    .get('/api/products/search')
    .query({ q: ` ${'a'.repeat(150)} ` });

  assert.equal(response.status, 200);
  assert.equal(response.body.searchTerm, 'a'.repeat(100));
  assert.equal(
    productService.searchProducts.mock.calls[0]?.arguments[0],
    'a'.repeat(100),
  );
});

test('GET /api/products/search should treat a repeated q as blank, like the frontend', async () => {
  const response = await request(app).get('/api/products/search?q=a&q=b');

  assert.equal(response.status, 200);
  assert.equal(response.body.searchTerm, '');
  assert.equal(productService.searchProducts.mock.calls[0]?.arguments[0], '');
});

test('GET /api/products/search should return 500 without details when the service fails', async () => {
  productService.searchProducts.mock.mockImplementation(async () => {
    throw new Error('connection refused at 10.0.0.1');
  });
  const consoleError = mock.method(console, 'error', () => {});

  const response = await request(app).get('/api/products/search?q=lamp');

  consoleError.mock.restore();
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    message: 'Unable to complete the request.',
  });
});
