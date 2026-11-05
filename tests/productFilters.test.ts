import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, mock, test } from 'node:test';
import { createApp } from '../src/app';
import type { PrismaClient } from '../src/generated/prisma/client';
import type { CatalogProduct } from '../src/models/catalog_model';
import {
  buildFacets,
  DEFAULT_FILTERS,
  filterProducts,
  type ProductFilters,
  parseProductFilters,
  SORT_OPTIONS,
  sortProducts,
} from '../src/models/product_filter_model';
import { createCatalogService } from '../src/service/catalog_service';
import { noPopular } from './support/popularStubs';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p94AAAAASUVORK5CYII=',
  'base64',
);

function product(
  id: string,
  name: string,
  category: string,
  price: number,
  stock: number,
  createdAt: string,
): CatalogProduct {
  return {
    id,
    name,
    category,
    description: `${name} description`,
    price,
    stock,
    outOfStock: false,
    image: Uint8Array.from(PNG),
    createdAt: new Date(createdAt),
  };
}

// In name order, like the repository's findAll().
const CATALOGUE: CatalogProduct[] = [
  product('cap', 'Baseball Cap', 'Accessories', 10.99, 78, '2026-10-03'),
  product('boots', 'Chelsea Boots', 'Footwear', 89, 0, '2026-10-05'),
  product('hoodie', 'Kainos Hoodie', 'Hoodie', 8.99, 65, '2026-10-01'),
  product('trainers', 'Running Trainers', 'Footwear', 64.99, 29, '2026-10-02'),
  product('beanie', 'Wool Beanie', 'Accessories', 7.5, 0, '2026-10-04'),
];

const filters = (overrides: Partial<ProductFilters>): ProductFilters => ({
  ...DEFAULT_FILTERS,
  ...overrides,
});
const ids = (products: readonly { id: string }[]) => products.map((p) => p.id);

describe('parseProductFilters', () => {
  test('reads every filter, including repeated categories', () => {
    assert.deepEqual(
      parseProductFilters({
        stock: ['in', 'out', 'in'],
        category: [' Footwear ', 'Accessories', 'Footwear'],
        minPrice: '10',
        maxPrice: '£25.5',
        sort: 'price-desc',
      }),
      {
        stock: ['in', 'out'],
        categories: ['Footwear', 'Accessories'],
        minPricePence: 1000,
        maxPricePence: 2550,
        sort: 'price-desc',
      },
    );
  });

  test('ignores bad values instead of rejecting the request', () => {
    assert.deepEqual(
      parseProductFilters({
        stock: 'maybe',
        category: ['', 'x'.repeat(101)],
        minPrice: 'cheap',
        maxPrice: '-5',
        sort: 'random',
      }),
      DEFAULT_FILTERS,
    );
    assert.deepEqual(parseProductFilters({}), DEFAULT_FILTERS);
    assert.equal(
      parseProductFilters({ minPrice: '1.999' }).minPricePence,
      null,
    );
  });

  test('swaps a reversed price range', () => {
    const parsed = parseProductFilters({ minPrice: '50', maxPrice: '10' });
    assert.equal(parsed.minPricePence, 1000);
    assert.equal(parsed.maxPricePence, 5000);
  });
});

describe('filterProducts', () => {
  test('filters by stock, where ticking both boxes shows everything', () => {
    assert.deepEqual(
      ids(filterProducts(CATALOGUE, filters({ stock: ['in'] }))),
      ['cap', 'hoodie', 'trainers'],
    );
    assert.deepEqual(
      ids(filterProducts(CATALOGUE, filters({ stock: ['out'] }))),
      ['boots', 'beanie'],
    );
    assert.equal(
      filterProducts(CATALOGUE, filters({ stock: ['in', 'out'] })).length,
      5,
    );
  });

  test('combines several categories, stock and a price range', () => {
    assert.deepEqual(
      ids(
        filterProducts(
          CATALOGUE,
          filters({
            categories: ['Accessories', 'Footwear'],
            stock: ['in'],
            minPricePence: 1000,
            maxPricePence: 6499,
          }),
        ),
      ),
      ['cap', 'trainers'],
    );
  });

  test('respects explicit out-of-stock status in filters, facets and recommended order', () => {
    const products = CATALOGUE.map((item) =>
      item.id === 'cap' ? { ...item, outOfStock: true } : item,
    );
    assert.deepEqual(
      ids(filterProducts(products, filters({ stock: ['in'] }))),
      ['hoodie', 'trainers'],
    );
    assert.deepEqual(
      ids(filterProducts(products, filters({ stock: ['out'] }))),
      ['cap', 'boots', 'beanie'],
    );
    assert.deepEqual(buildFacets(products, DEFAULT_FILTERS).stock, {
      in: 2,
      out: 3,
    });
    assert.deepEqual(ids(sortProducts(products, 'recommended')), [
      'hoodie',
      'trainers',
      'cap',
      'boots',
      'beanie',
    ]);
  });
});

describe('sortProducts', () => {
  const unitsSold = new Map([
    ['hoodie', 12],
    ['trainers', 30],
    ['cap', 12],
  ]);
  const cases: Record<(typeof SORT_OPTIONS)[number], string[]> = {
    // Given order, with out-of-stock products last.
    recommended: ['cap', 'hoodie', 'trainers', 'boots', 'beanie'],
    'price-asc': ['beanie', 'hoodie', 'cap', 'trainers', 'boots'],
    'price-desc': ['boots', 'trainers', 'cap', 'hoodie', 'beanie'],
    newest: ['boots', 'beanie', 'cap', 'trainers', 'hoodie'],
    oldest: ['hoodie', 'trainers', 'cap', 'beanie', 'boots'],
    // Equal sales fall back to the name: Baseball Cap before Kainos Hoodie.
    'most-bought': ['trainers', 'cap', 'hoodie', 'boots', 'beanie'],
    'name-asc': ['cap', 'boots', 'hoodie', 'trainers', 'beanie'],
    'name-desc': ['beanie', 'trainers', 'hoodie', 'boots', 'cap'],
  };
  for (const sort of SORT_OPTIONS) {
    test(`sorts by ${sort}`, () => {
      assert.deepEqual(
        ids(sortProducts(CATALOGUE, sort, unitsSold)),
        cases[sort],
      );
    });
  }

  test('does not change the products it was given', () => {
    const before = ids(CATALOGUE);
    sortProducts(CATALOGUE, 'price-desc');
    assert.deepEqual(ids(CATALOGUE), before);
  });
});

describe('buildFacets', () => {
  test('counts each option against the other active filters', () => {
    const facets = buildFacets(
      CATALOGUE,
      filters({ stock: ['in'], categories: ['Footwear'] }),
    );
    assert.equal(facets.total, 5);
    // Stock filter applies to category counts: only in-stock products count.
    assert.deepEqual(facets.categories, [
      { name: 'Accessories', count: 1 },
      { name: 'Footwear', count: 1 },
      { name: 'Hoodie', count: 1 },
    ]);
    // Category filter applies to stock counts: only Footwear counts.
    assert.deepEqual(facets.stock, { in: 1, out: 1 });
    assert.deepEqual(facets.priceRange, { min: '7.50', max: '89.00' });
  });

  test('keeps very large prices exact in the price range', () => {
    const hair = product(
      'hair',
      "Lee's Hair",
      'Home',
      828938392829282,
      0,
      '2026-10-01',
    );
    assert.deepEqual(buildFacets([hair], DEFAULT_FILTERS).priceRange, {
      min: '828938392829282.00',
      max: '828938392829282.00',
    });
  });

  test('has no price range when nothing matched', () => {
    assert.deepEqual(buildFacets([], DEFAULT_FILTERS), {
      total: 0,
      categories: [],
      stock: { in: 0, out: 0 },
      priceRange: null,
    });
  });
});

describe('catalog service with filters', () => {
  function serviceWith(unitsSold = new Map<string, number>()) {
    const findUnitsSold = mock.fn(async () => unitsSold);
    const service = createCatalogService({
      ...noPopular,
      findAll: async () => CATALOGUE,
      findById: async () => null,
      findUnitsSold,
    });
    return { service, findUnitsSold };
  }

  test('only loads sales when sorting by most bought', async () => {
    const { service, findUnitsSold } = serviceWith(new Map([['hoodie', 5]]));
    await service.getAll(filters({ sort: 'price-asc' }));
    assert.equal(findUnitsSold.mock.callCount(), 0);
    const result = await service.getAll(filters({ sort: 'most-bought' }));
    assert.equal(findUnitsSold.mock.callCount(), 1);
    assert.equal(result.products[0]?.id, 'hoodie');
  });

  test('filters search matches and reports their facets', async () => {
    const { service } = serviceWith();
    const result = await service.search('footwear', filters({ stock: ['in'] }));
    assert.deepEqual(ids(result.products), ['trainers']);
    assert.equal(result.facets.total, 2);
    assert.deepEqual(result.facets.stock, { in: 1, out: 1 });
    assert.deepEqual(result.appliedFilters.stock, ['in']);
  });
});

describe('GET /api/products and /api/products/search with filters', () => {
  async function withServer(run: (baseUrl: string) => Promise<void>) {
    const database = {
      product: {
        findMany: async () => CATALOGUE,
        findUnique: async () => null,
      },
      order_products: {
        groupBy: async () => [],
        findMany: async () => [
          { product_id: 'cap', amount: 3 },
          { product_id: 'cap', amount: 4 },
          { product_id: 'boots', amount: 5 },
        ],
      },
    };
    const server = createApp(
      database as unknown as PrismaClient,
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

  test('applies repeated query parameters and echoes the applied filters', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/api/products?category=Accessories&category=Footwear&sort=most-bought&maxPrice=100`,
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        products: { id: string; createdAt: string }[];
        appliedFilters: unknown;
      };
      // Cap sold 7 over two orders, boots sold 5.
      assert.deepEqual(ids(body.products), [
        'cap',
        'boots',
        'trainers',
        'beanie',
      ]);
      assert.equal(body.products[0]?.createdAt, '2026-10-03T00:00:00.000Z');
      assert.deepEqual(body.appliedFilters, {
        stock: [],
        categories: ['Accessories', 'Footwear'],
        minPrice: null,
        maxPrice: '100.00',
        sort: 'most-bought',
      });
    });
  });

  test('filters and sorts search results', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/api/products/search?q=footwear&sort=price-asc&stock=in&stock=out`,
      );
      const body = (await res.json()) as {
        products: { id: string; category: string }[];
        facets: { total: number };
      };
      assert.deepEqual(ids(body.products), ['trainers', 'boots']);
      assert.equal(body.products[0]?.category, 'Footwear');
      assert.equal(body.facets.total, 2);
    });
  });
});
