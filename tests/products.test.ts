import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from '../src/app';
import type { PrismaClient } from '../src/generated/prisma/client';

const product = {
  id: 'product-123',
  name: 'Desk Lamp',
  category: 'Home',
  description: 'A compact desk lamp.',
  price: 24.99,
  stock: 8,
  image: Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p94AAAAASUVORK5CYII=',
      'base64',
    ),
  ),
};

const expectedProduct = {
  ...product,
  image: `data:image/png;base64,${Buffer.from(product.image).toString('base64')}`,
};

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
  const address = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('GET /api/products returns the product list as JSON', async () => {
  const database = {
    product: {
      findMany: async ({
        select,
        orderBy,
      }: {
        select: object;
        orderBy: object;
      }) => {
        assert.deepEqual(select, {
          id: true,
          name: true,
          category: true,
          description: true,
          price: true,
          stock: true,
          image: true,
        });
        assert.deepEqual(orderBy, { name: 'asc' });
        return [product];
      },
    },
  };

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/products`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { products: [expectedProduct] });
  });
});

test('GET /api/products returns an empty list when there are no products', async () => {
  await withServer(
    { product: { findMany: async () => [] } },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/products`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { products: [] });
    },
  );
});

test('GET /api/products reports database failures instead of returning products', async () => {
  await withServer(
    {
      product: {
        findMany: async () => {
          throw new Error('Database unavailable');
        },
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/products`);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), {
        message: 'Unable to complete the request.',
      });
    },
  );
});

test('GET /api/products/:id returns a product by ID', async () => {
  const database = {
    product: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === product.id ? product : null,
    },
  };

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/products/${product.id}`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { product: expectedProduct });
  });
});

test('GET /api/products/:id returns 404 when the product is missing', async () => {
  const database = {
    product: {
      findUnique: async () => null,
    },
  };

  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/products/missing`);

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { message: 'Product not found.' });
  });
});

for (const file of ['desk-lamp.svg', 'ceramic-mug.svg', 'notebook.svg']) {
  test(`product endpoints return the correct image type and bytes for ${file}`, async () => {
    const image = readFileSync(
      new URL(`../prisma/images/${file}`, import.meta.url),
    );
    const svgProduct = { ...product, image };
    const expected = {
      ...svgProduct,
      image: `data:image/svg+xml;base64,${image.toString('base64')}`,
    };

    assert.match(image.toString('utf8'), /width="640" height="480"/);
    await withServer(
      {
        product: {
          findMany: async () => [svgProduct],
          findUnique: async () => svgProduct,
        },
      },
      async (baseUrl) => {
        const list = await fetch(`${baseUrl}/api/products`);
        assert.equal(list.status, 200);
        assert.deepEqual(await list.json(), { products: [expected] });
        const detail = await fetch(`${baseUrl}/api/products/${product.id}`);
        assert.equal(detail.status, 200);
        assert.deepEqual(await detail.json(), { product: expected });
      },
    );
  });
}

for (const [mimeType, image] of [
  ['image/jpeg', Buffer.from('ffd8ffe000104a4649460001', 'hex')],
  ['image/webp', Buffer.from('524946460c0000005745425056503820', 'hex')],
] as const) {
  test(`product endpoints return ${mimeType} data URLs with unchanged bytes`, async () => {
    const storedProduct = { ...product, image };
    const expected = {
      ...storedProduct,
      image: `data:${mimeType};base64,${image.toString('base64')}`,
    };
    await withServer(
      {
        product: {
          findMany: async () => [product, storedProduct],
          findUnique: async () => storedProduct,
        },
      },
      async (baseUrl) => {
        const list = await fetch(`${baseUrl}/api/products`);
        assert.equal(list.status, 200);
        assert.deepEqual(await list.json(), {
          products: [expectedProduct, expected],
        });
        const detail = await fetch(`${baseUrl}/api/products/${product.id}`);
        assert.equal(detail.status, 200);
        assert.deepEqual(await detail.json(), { product: expected });
      },
    );
  });
}

test('GET /api/products reports unsupported image data explicitly', async () => {
  await withServer(
    {
      product: {
        findMany: async () => [
          { ...product, image: Buffer.from('not an image') },
        ],
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/products`);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), {
        message: 'Unable to complete the request.',
      });
    },
  );
});
