import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, test } from 'node:test';
import { createApp } from '../src/app';
import type { PrismaClient } from '../src/generated/prisma/client';
import type { CatalogProduct } from '../src/models/catalog_model';
import {
  findProducts,
  MAX_SEARCH_TERM_LENGTH,
  normaliseSearchTerm,
} from '../src/models/product_search_model';
import { createCatalogService } from '../src/service/catalog_service';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p94AAAAASUVORK5CYII=',
  'base64',
);

function product(
  id: string,
  name: string,
  category: string,
  overrides: Partial<CatalogProduct> = {},
): CatalogProduct {
  return {
    id,
    name,
    category,
    description: `${name} description`,
    price: 10,
    stock: 5,
    image: Uint8Array.from(PNG),
    ...overrides,
  };
}

// Mirrors the seed catalogue (prisma/seed.ts), ordered by name like findAll().
const CATALOGUE: CatalogProduct[] = [
  product('hoodie', 'Kainos Hoodie', 'Hoodie', { price: 8.99 }),
  product('hair', "Lee's Hair", 'Home', { stock: 0 }),
  product('metallica', 'Metellica Band Shirt', 'Shirt'),
  product('pou', 'POU Shirt', 'Shirt', { price: 12.5 }),
  product('crown', 'Princess Dylan Crown', 'Home'),
  product('jeans', 'Swaggy Jeans', 'Jeans', { price: 24.99 }),
];

const namesFor = (term: string) =>
  findProducts(CATALOGUE, term).products.map(({ name }) => name);

describe('normaliseSearchTerm', () => {
  test('trims the term and caps its length', () => {
    assert.equal(normaliseSearchTerm('  hoodie  '), 'hoodie');
    assert.equal(
      normaliseSearchTerm('a'.repeat(MAX_SEARCH_TERM_LENGTH + 20)).length,
      MAX_SEARCH_TERM_LENGTH,
    );
  });

  test('treats a missing or repeated q as an empty search', () => {
    assert.equal(normaliseSearchTerm(undefined), '');
    assert.equal(normaliseSearchTerm(['a', 'b']), '');
  });
});

describe('findProducts', () => {
  test('matches names case-insensitively and keeps catalogue order', () => {
    assert.deepEqual(namesFor('SHIRT'), ['Metellica Band Shirt', 'POU Shirt']);
    assert.equal(findProducts(CATALOGUE, 'shirt').isClosestMatch, false);
  });

  test('matches the category as well as the name', () => {
    assert.deepEqual(namesFor('home'), ["Lee's Hair", 'Princess Dylan Crown']);
  });

  test('requires every word to match', () => {
    assert.deepEqual(namesFor('pou shirt'), ['POU Shirt']);
    assert.deepEqual(namesFor('pou jeans'), []);
  });

  test('matches partly typed words', () => {
    assert.deepEqual(namesFor('hood'), ['Kainos Hoodie']);
  });

  test('corrects typos and reports a closest match', () => {
    const result = findProducts(CATALOGUE, 'hodie');
    assert.deepEqual(
      result.products.map(({ name }) => name),
      ['Kainos Hoodie'],
    );
    assert.equal(result.isClosestMatch, true);
    assert.deepEqual(namesFor('swagy jeens'), ['Swaggy Jeans']);
  });

  test('does not correct very short words', () => {
    assert.deepEqual(namesFor('xy'), []);
  });

  test('returns nothing for blank or unrelated terms', () => {
    assert.deepEqual(findProducts(CATALOGUE, '   '), {
      products: [],
      isClosestMatch: false,
    });
    assert.deepEqual(findProducts(CATALOGUE, 'xyzzy'), {
      products: [],
      isClosestMatch: false,
    });
  });
});

describe('catalog service search', () => {
  const service = createCatalogService({
    findAll: async () => CATALOGUE,
    findById: async () => null,
  });

  test('returns products in the shape the frontend search page expects', async () => {
    const result = await service.search('hoodie');
    assert.deepEqual(result, {
      products: [
        {
          id: 'hoodie',
          name: 'Kainos Hoodie',
          description: 'Kainos Hoodie description',
          imageUrl: `data:image/png;base64,${PNG.toString('base64')}`,
          price: '8.99',
          keywords: ['Hoodie'],
          isInStock: true,
        },
      ],
      isClosestMatch: false,
    });
  });

  test('formats whole-pound prices with two decimals and reports stock', async () => {
    const [pou] = (await service.search('pou')).products;
    assert.equal(pou?.price, '12.50');
    const [hair] = (await service.search('hair')).products;
    assert.equal(hair?.isInStock, false);
  });

  test('does not load the catalogue for an empty search', async () => {
    let loads = 0;
    const counting = createCatalogService({
      findAll: async () => {
        loads += 1;
        return CATALOGUE;
      },
      findById: async () => null,
    });
    assert.deepEqual(await counting.search(''), {
      products: [],
      isClosestMatch: false,
    });
    assert.equal(loads, 0);
  });
});

describe('GET /api/products/search', () => {
  async function withServer(run: (baseUrl: string) => Promise<void>) {
    const database = {
      product: {
        findMany: async () => CATALOGUE,
        findUnique: async () => {
          throw new Error('search must not be treated as a product id');
        },
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

  test('returns matching products and echoes the cleaned search term', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/products/search?q=%20hodie%20`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        searchTerm: string;
        products: { name: string }[];
        isClosestMatch: boolean;
      };
      assert.equal(body.searchTerm, 'hodie');
      assert.deepEqual(
        body.products.map(({ name }) => name),
        ['Kainos Hoodie'],
      );
      assert.equal(body.isClosestMatch, true);
    });
  });

  test('returns an empty result when q is missing', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/products/search`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), {
        searchTerm: '',
        products: [],
        isClosestMatch: false,
      });
    });
  });
});
