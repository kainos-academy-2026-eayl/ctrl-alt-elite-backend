import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, mock, test } from 'node:test';
import { createApp } from '../src/app';
import type { PrismaClient } from '../src/generated/prisma/client';
import type { CatalogProduct } from '../src/models/catalog_model';
import { normaliseTranslationLocale } from '../src/models/product_translation_model';
import { createProductTranslationRepository } from '../src/repo/product_translation_repository';
import { createCatalogService } from '../src/service/catalog_service';
import { noPopular } from './support/popularStubs';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p94AAAAASUVORK5CYII=',
  'base64',
);

function product(id: string, name: string, category: string): CatalogProduct {
  return {
    id,
    name,
    category,
    description: `${name} description`,
    price: 10,
    stock: 5,
    outOfStock: false,
    image: Uint8Array.from(PNG),
    createdAt: new Date('2026-10-22T10:00:00Z'),
  } as CatalogProduct;
}

const CATALOGUE = [
  product('boots', 'Chelsea Boots', 'Footwear'),
  product('cap', 'Baseball Cap', 'Accessories'),
];

const FRENCH_ROWS = [
  {
    productId: 'boots',
    name: 'Bottines Chelsea',
    description: 'Des bottines en cuir.',
  },
  {
    productId: 'cap',
    name: 'Casquette de baseball',
    description: 'Une casquette réglable.',
  },
];

describe('normaliseTranslationLocale', () => {
  test('accepts the supported languages and nothing else', () => {
    assert.equal(normaliseTranslationLocale(' FR '), 'fr');
    assert.equal(normaliseTranslationLocale('cy'), 'cy');
    assert.equal(normaliseTranslationLocale('ga'), 'ga');
    for (const value of ['en', 'de', '', undefined, ['fr']]) {
      assert.equal(normaliseTranslationLocale(value), null, String(value));
    }
  });
});

describe('product translation repository', () => {
  test('loads one language as a map by product id', async () => {
    const findMany = mock.fn(async () => FRENCH_ROWS);
    const repository = createProductTranslationRepository({
      productTranslation: { findMany },
    });
    const translations = await repository.findByLocale('fr');
    assert.deepEqual(findMany.mock.calls[0]?.arguments, [
      {
        where: { locale: 'fr' },
        select: { productId: true, name: true, description: true },
      },
    ]);
    assert.deepEqual(translations.get('boots'), {
      name: 'Bottines Chelsea',
      description: 'Des bottines en cuir.',
    });
  });
});

describe('catalog search in another language', () => {
  const translations = new Map(
    FRENCH_ROWS.map((row) => [
      row.productId,
      { name: row.name, description: row.description },
    ]),
  );
  const service = createCatalogService(
    {
      ...noPopular,
      findAll: async () => CATALOGUE,
      findById: async () => null,
    },
    async () => translations,
  );

  test('matches translated names as well as English ones', async () => {
    const french = await service.search('casquette', undefined, 'fr');
    assert.deepEqual(
      french.products.map(({ id }) => id),
      ['cap'],
    );
    // Results keep their English names; the frontend shows the translation.
    assert.equal(french.products[0]?.name, 'Baseball Cap');
    const english = await service.search('boots', undefined, 'fr');
    assert.deepEqual(
      english.products.map(({ id }) => id),
      ['boots'],
    );
  });

  test('only matches English names when no language is given', async () => {
    const result = await service.search('casquette');
    assert.deepEqual(result.products, []);
  });
});

describe('GET /api/product-translations', () => {
  async function withServer(run: (baseUrl: string) => Promise<void>) {
    const database = {
      product: {
        findMany: async () => CATALOGUE,
        findUnique: async () => null,
      },
      productTranslation: {
        findMany: async ({ where }: { where: { locale: string } }) =>
          where.locale === 'fr' ? FRENCH_ROWS : [],
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

  test('returns every translation for a language by product id', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/product-translations?lang=fr`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), {
        lang: 'fr',
        translations: {
          boots: {
            name: 'Bottines Chelsea',
            description: 'Des bottines en cuir.',
          },
          cap: {
            name: 'Casquette de baseball',
            description: 'Une casquette réglable.',
          },
        },
      });
    });
  });

  test('rejects unsupported languages', async () => {
    await withServer(async (baseUrl) => {
      for (const lang of ['', 'en', 'de']) {
        const res = await fetch(
          `${baseUrl}/api/product-translations?lang=${lang}`,
        );
        assert.equal(res.status, 400, lang);
        assert.deepEqual(await res.json(), {
          message: 'lang must be one of: cy, ga, fr.',
        });
      }
    });
  });

  test('searches translated names when lang is given', async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/api/products/search?q=bottines&lang=fr`,
      );
      const body = (await res.json()) as { products: { id: string }[] };
      assert.deepEqual(
        body.products.map(({ id }) => id),
        ['boots'],
      );
    });
  });
});
