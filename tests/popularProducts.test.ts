import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, mock, test } from 'node:test';
import { createApp } from '../src/app';
import type { PrismaClient } from '../src/generated/prisma/client';
import {
  DEFAULT_POPULAR_LIMIT,
  MAX_POPULAR_LIMIT,
  normalisePopularLimit,
  type PopularProduct,
} from '../src/models/popular_products_model';
import { createPopularProductsRepository } from '../src/repo/popular_products_repository';
import { createPopularProductsService } from '../src/service/popular_products_service';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p94AAAAASUVORK5CYII=',
  'base64',
);
const PNG_URL = `data:image/png;base64,${PNG.toString('base64')}`;

function product(id: string, price = 10): PopularProduct {
  return { id, name: `Product ${id}`, price, image: Uint8Array.from(PNG) };
}

const select = { id: true, name: true, price: true, image: true };

describe('normalisePopularLimit', () => {
  test('uses the default when limit is missing or invalid', () => {
    for (const raw of [undefined, '', 'abc', '-3', '0', '2.5', ['4', '5']]) {
      assert.equal(
        normalisePopularLimit(raw),
        DEFAULT_POPULAR_LIMIT,
        String(raw),
      );
    }
  });

  test('accepts a positive whole number and caps large values', () => {
    assert.equal(normalisePopularLimit('3'), 3);
    assert.equal(normalisePopularLimit('999'), MAX_POPULAR_LIMIT);
  });
});

describe('popular products repository', () => {
  test('ranks in-stock products by total units ordered', async () => {
    const groupBy = mock.fn(async () => [
      { product_id: 'b' },
      { product_id: 'a' },
    ]);
    const repository = createPopularProductsRepository({
      order_products: { groupBy },
      product: { findMany: async () => [] },
    });

    assert.deepEqual(await repository.findTopSellingIds(4), ['b', 'a']);
    assert.deepEqual(groupBy.mock.calls[0]?.arguments, [
      {
        by: ['product_id'],
        where: { product: { stock: { gt: 0 } } },
        _sum: { amount: true },
        orderBy: [{ _sum: { amount: 'desc' } }, { product_id: 'asc' }],
        take: 4,
      },
    ]);
  });

  test('loads in-stock products by ID and newest in-stock products', async () => {
    const findMany = mock.fn(async () => [product('a')]);
    const repository = createPopularProductsRepository({
      order_products: { groupBy: async () => [] },
      product: { findMany },
    });

    await repository.findInStockByIds(['a', 'b']);
    await repository.findNewestInStock(['a'], 2);

    assert.deepEqual(findMany.mock.calls[0]?.arguments, [
      { where: { id: { in: ['a', 'b'] }, stock: { gt: 0 } }, select },
    ]);
    assert.deepEqual(findMany.mock.calls[1]?.arguments, [
      {
        where: { id: { notIn: ['a'] }, stock: { gt: 0 } },
        orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
        take: 2,
        select,
      },
    ]);
  });
});

describe('popular products service', () => {
  test('keeps best-seller order and returns the conveyor shape', async () => {
    const findNewestInStock = mock.fn(async () => []);
    const service = createPopularProductsService({
      findTopSellingIds: async () => ['b', 'a'],
      // The database does not guarantee order for an `in` query.
      findInStockByIds: async () => [product('a', 5), product('b', 12.5)],
      findNewestInStock,
    });

    assert.deepEqual(await service.getPopular(2), [
      { id: 'b', name: 'Product b', price: '12.50', imageUrl: PNG_URL },
      { id: 'a', name: 'Product a', price: '5.00', imageUrl: PNG_URL },
    ]);
    assert.equal(findNewestInStock.mock.callCount(), 0);
  });

  test('fills spare slots with the newest in-stock products', async () => {
    const findNewestInStock = mock.fn(
      async (_exclude: string[], _limit: number) => [product('new')],
    );
    const service = createPopularProductsService({
      // 'gone' sold well but went out of stock between queries.
      findTopSellingIds: async () => ['a', 'gone'],
      findInStockByIds: async () => [product('a')],
      findNewestInStock,
    });

    const ids = (await service.getPopular(3)).map(({ id }) => id);

    assert.deepEqual(ids, ['a', 'new']);
    assert.deepEqual(findNewestInStock.mock.calls[0]?.arguments, [
      ['a', 'gone'],
      2,
    ]);
  });

  test('uses only newest products when nothing has been ordered', async () => {
    const findInStockByIds = mock.fn(async () => []);
    const service = createPopularProductsService({
      findTopSellingIds: async () => [],
      findInStockByIds,
      findNewestInStock: async () => [product('x'), product('y')],
    });

    const ids = (await service.getPopular(6)).map(({ id }) => id);

    assert.deepEqual(ids, ['x', 'y']);
    assert.equal(findInStockByIds.mock.callCount(), 0);
  });
});

describe('GET /api/products/popular', () => {
  async function withServer(
    database: unknown,
    run: (baseUrl: string) => Promise<void>,
  ) {
    const server = createApp(
      database as PrismaClient,
      'http://localhost:3000',
      'test-only-secret-with-at-least-32-bytes',
    ).listen(0);
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    try {
      await run(`http://127.0.0.1:${port}`);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }

  function fakeDatabase(takes: number[] = []) {
    return {
      order_products: {
        groupBy: async ({ take }: { take: number }) => {
          takes.push(take);
          return [{ product_id: 'a' }];
        },
      },
      product: {
        findMany: async ({ where }: { where: { id: object } }) =>
          'in' in where.id ? [product('a')] : [product('new')],
        findUnique: async () => {
          throw new Error('popular must not be treated as a product id');
        },
      },
    };
  }

  test('returns popular products for the conveyor belt', async () => {
    await withServer(fakeDatabase(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/products/popular`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), {
        products: [
          { id: 'a', name: 'Product a', price: '10.00', imageUrl: PNG_URL },
          { id: 'new', name: 'Product new', price: '10.00', imageUrl: PNG_URL },
        ],
      });
    });
  });

  test('passes a valid limit through and caps large ones', async () => {
    const takes: number[] = [];
    await withServer(fakeDatabase(takes), async (baseUrl) => {
      await fetch(`${baseUrl}/api/products/popular?limit=3`);
      await fetch(`${baseUrl}/api/products/popular?limit=500`);
      await fetch(`${baseUrl}/api/products/popular?limit=nope`);
    });
    assert.deepEqual(takes, [3, MAX_POPULAR_LIMIT, DEFAULT_POPULAR_LIMIT]);
  });

  test('returns 500 when the database fails', async () => {
    const database = {
      order_products: {
        groupBy: async () => {
          throw new Error('Database unavailable');
        },
      },
    };
    await withServer(database, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/products/popular`);
      assert.equal(res.status, 500);
    });
  });
});
