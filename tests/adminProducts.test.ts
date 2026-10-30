import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client';
import { createAuthorization } from '../src/middleware/authorization_middleware';

const secret = 'test-only-secret-with-at-least-32-bytes';
const orderedMessage =
  'This product has been ordered and cannot be deleted. Set its stock to 0 instead.';

const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p94AAAAASUVORK5CYII=',
  'base64',
);
const svgBytes = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
);
const pngUrl = `data:image/png;base64,${pngBytes.toString('base64')}`;
const svgUrl = (markup: string) =>
  `data:image/svg+xml;base64,${Buffer.from(markup).toString('base64')}`;

interface StoredProduct {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  stock: number;
  image: Uint8Array;
}

function notFound() {
  return new Prisma.PrismaClientKnownRequestError('Not found', {
    code: 'P2025',
    clientVersion: 'test',
  });
}

async function fixture() {
  const state = {
    role: 'ADMIN',
    products: new Map<string, StoredProduct>(),
    orderedIds: new Set<string>(),
    basketRows: [] as { productId: string }[],
    raceNextBasketInsert: null as string | null,
    transactionAttempts: 0,
    nextId: 1,
  };
  const productTable = {
    findMany: async () =>
      [...state.products.values()].sort((a, b) => a.name.localeCompare(b.name)),
    findUnique: async ({ where }: { where: { id: string } }) =>
      state.products.get(where.id) ?? null,
    create: async ({ data }: { data: Omit<StoredProduct, 'id'> }) => {
      const product = { ...data, id: `product-${state.nextId++}` };
      state.products.set(product.id, product);
      return product;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<StoredProduct>;
    }) => {
      const existing = state.products.get(where.id);
      if (!existing) throw notFound();
      const updated = { ...existing, ...data };
      state.products.set(where.id, updated);
      return updated;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      state.products.delete(where.id);
    },
  };
  const orderProducts = {
    findFirst: async ({ where }: { where: { product_id: string } }) =>
      state.orderedIds.has(where.product_id)
        ? { product_id: where.product_id }
        : null,
  };
  const basketItem = {
    deleteMany: async ({ where }: { where: { productId: string } }) => {
      state.basketRows = state.basketRows.filter(
        (row) => row.productId !== where.productId,
      );
    },
  };
  const database = {
    user: {
      findUnique: async () => ({ role: state.role }),
    },
    product: productTable,
    order_products: orderProducts,
    basketItem,
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      state.transactionAttempts += 1;
      // Roll back the in-memory state if the callback fails, like a real transaction.
      const snapshot = {
        products: new Map(state.products),
        basketRows: [...state.basketRows],
      };
      try {
        const result = await run({
          product: productTable,
          order_products: orderProducts,
          basketItem,
        });
        if (state.raceNextBasketInsert) {
          throw new Prisma.PrismaClientKnownRequestError(
            'Foreign key constraint failed',
            {
              code: 'P2003',
              clientVersion: 'test',
            },
          );
        }
        return result;
      } catch (error) {
        state.products = snapshot.products;
        state.basketRows = snapshot.basketRows;
        if (state.raceNextBasketInsert) {
          state.basketRows.push({ productId: state.raceNextBasketInsert });
          state.raceNextBasketInsert = null;
        }
        throw error;
      }
    },
  } as unknown as PrismaClient;
  const { issueToken } = createAuthorization(database, secret);
  const token = await issueToken('admin-1');
  const app = createApp(database, 'http://localhost:5500', secret);
  const admin = (req: request.Test) => req.auth(token, { type: 'bearer' });

  const seed = (overrides: Partial<StoredProduct> = {}): StoredProduct => {
    const product: StoredProduct = {
      id: `product-${state.nextId++}`,
      name: 'Desk Lamp',
      category: 'Home',
      description: 'A lamp.',
      price: 24.99,
      stock: 8,
      image: pngBytes,
      ...overrides,
    };
    state.products.set(product.id, product);
    return product;
  };

  return { app, state, admin, seed };
}

const validBody = {
  name: 'Desk Lamp',
  category: 'Home',
  description: 'A lamp.',
  price: 24.99,
  stock: 8,
  image: pngUrl,
};

test('admin can list products ordered by name with no-store caching', async () => {
  const { app, admin, seed } = await fixture();
  seed({ name: 'Zebra Mug' });
  seed({ name: 'Anchor Poster' });
  const response = await admin(request(app).get('/api/admin/products'));
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(
    response.body.products.map((product: { name: string }) => product.name),
    ['Anchor Poster', 'Zebra Mug'],
  );
  assert.equal(response.body.products[0].image, pngUrl);
});

test('admin can get a product and gets 404 for an unknown id', async () => {
  const { app, admin, seed } = await fixture();
  const product = seed();
  const found = await admin(
    request(app).get(`/api/admin/products/${product.id}`),
  );
  assert.equal(found.status, 200);
  assert.deepEqual(found.body.product, {
    id: product.id,
    name: 'Desk Lamp',
    category: 'Home',
    description: 'A lamp.',
    price: 24.99,
    stock: 8,
    image: pngUrl,
  });

  const missing = await admin(request(app).get('/api/admin/products/nope'));
  assert.equal(missing.status, 404);
  assert.equal(typeof missing.body.message, 'string');
});

test('admin can create a product', async () => {
  const { app, admin, state } = await fixture();
  const response = await admin(
    request(app)
      .post('/api/admin/products')
      .send({ ...validBody, name: '  Desk Lamp  ', description: undefined }),
  );
  assert.equal(response.status, 201);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(
    response.headers.location,
    `/api/admin/products/${response.body.product.id}`,
  );
  assert.equal(response.body.product.name, 'Desk Lamp');
  assert.equal(response.body.product.description, '');
  assert.equal(response.body.product.image, pngUrl);
  assert.equal(state.products.size, 1);
});

test('creating a product requires JSON', async () => {
  const { app, admin } = await fixture();
  const response = await admin(
    request(app)
      .post('/api/admin/products')
      .set('Content-Type', 'text/plain')
      .send('name=Lamp'),
  );
  assert.equal(response.status, 415);
  assert.equal(typeof response.body.message, 'string');
});

test('updating a product requires JSON', async () => {
  const { app, admin, seed } = await fixture();
  const product = seed();
  const response = await admin(
    request(app)
      .put(`/api/admin/products/${product.id}`)
      .set('Content-Type', 'text/plain')
      .send('name=Lamp'),
  );
  assert.equal(response.status, 415);
});

test('validation failures return 400 with field errors', async () => {
  const { app, admin } = await fixture();
  const invalid: [string, Record<string, unknown>][] = [
    ['name', { name: '   ' }],
    ['name', { name: 'a'.repeat(121) }],
    ['category', { category: '' }],
    ['category', { category: 'c'.repeat(61) }],
    ['description', { description: 'd'.repeat(2001) }],
    ['price', { price: -1 }],
    ['price', { price: 1_000_000.01 }],
    ['price', { price: 1.005 }],
    ['price', { price: '10' }],
    ['stock', { stock: -1 }],
    ['stock', { stock: 1.5 }],
    ['stock', { stock: 1_000_001 }],
    ['image', { image: undefined }],
  ];
  for (const [field, override] of invalid) {
    const response = await admin(
      request(app)
        .post('/api/admin/products')
        .send({ ...validBody, ...override }),
    );
    assert.equal(response.status, 400, JSON.stringify(override));
    assert.equal(typeof response.body.message, 'string');
    assert.ok(
      response.body.errors.some(
        (error: { field: string }) => error.field === field,
      ),
      `expected an error for ${field}`,
    );
  }

  const notAnObject = await admin(
    request(app).post('/api/admin/products').send([]),
  );
  assert.equal(notAnObject.status, 400);
});

test('boundary values are accepted', async () => {
  const { app, admin } = await fixture();
  const response = await admin(
    request(app)
      .post('/api/admin/products')
      .send({
        ...validBody,
        name: 'n'.repeat(120),
        category: 'c'.repeat(60),
        description: 'd'.repeat(2000),
        price: 1_000_000,
        stock: 0,
      }),
  );
  assert.equal(response.status, 201);
});

test('invalid images are rejected', async () => {
  const { app, admin } = await fixture();
  const withImage = (image: unknown) =>
    admin(
      request(app)
        .post('/api/admin/products')
        .send({ ...validBody, image }),
    );

  const textAsPng = `data:image/png;base64,${Buffer.from('not an image').toString('base64')}`;
  const jpegAsPng = `data:image/png;base64,${Buffer.from('ffd8ffe000104a464946', 'hex').toString('base64')}`;
  const gif = `data:image/gif;base64,${Buffer.from('GIF89a').toString('base64')}`;
  const notBase64 = 'data:image/png;base64,@@@@';
  const noPrefix = pngBytes.toString('base64');
  const tooLarge = `data:image/png;base64,${Buffer.concat([
    pngBytes,
    Buffer.alloc(1024 * 1024),
  ]).toString('base64')}`;

  for (const image of [
    textAsPng,
    jpegAsPng,
    gif,
    notBase64,
    noPrefix,
    tooLarge,
    123,
  ]) {
    const response = await withImage(image);
    assert.equal(response.status, 400, String(image).slice(0, 40));
    assert.ok(
      response.body.errors.some(
        (error: { field: string }) => error.field === 'image',
      ),
    );
  }
});

test('an image of exactly 1 MB is accepted', async () => {
  const { app, admin } = await fixture();
  const image = Buffer.concat([
    pngBytes,
    Buffer.alloc(1024 * 1024 - pngBytes.length),
  ]);
  const response = await admin(
    request(app)
      .post('/api/admin/products')
      .send({
        ...validBody,
        image: `data:image/png;base64,${image.toString('base64')}`,
      }),
  );
  assert.equal(response.status, 201);
});

test('SVG uploads are rejected, including namespace-prefixed script elements', async () => {
  const { app, admin, seed, state } = await fixture();
  const post = (markup: string) =>
    admin(
      request(app)
        .post('/api/admin/products')
        .send({ ...validBody, image: svgUrl(markup) }),
    );
  for (const markup of [
    svgBytes.toString(),
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg"><s:script>alert(1)</s:script></svg>',
  ]) {
    assert.equal((await post(markup)).status, 400, markup);
  }
  const product = seed();
  const update = await admin(
    request(app)
      .put(`/api/admin/products/${product.id}`)
      .send({
        ...validBody,
        image: svgUrl(
          '<svg xmlns:s="http://www.w3.org/2000/svg"><s:script/></svg>',
        ),
      }),
  );
  assert.equal(update.status, 400);
  assert.equal(state.products.get(product.id)?.image, pngBytes);
});

test('a request body over 1.5 MB is rejected with 413', async () => {
  const { app, admin } = await fixture();
  const response = await admin(
    request(app)
      .post('/api/admin/products')
      .send({ ...validBody, description: 'x'.repeat(1_600_000) }),
  );
  assert.equal(response.status, 413);
  assert.equal(typeof response.body.message, 'string');
});

test('an image-sized body is accepted for admins but the global limit still applies elsewhere', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { app, admin } = await fixture();
  const large = { ...validBody, description: 'x'.repeat(20_000) };

  const rejectedElsewhere = await request(app)
    .post('/api/auth/login')
    .send({ email: 'a@b.co', password: large.description });
  assert.equal(rejectedElsewhere.status, 413);

  const response = await admin(
    request(app).post('/api/admin/products').send(large),
  );
  assert.equal(response.status, 400); // description over 2000, not a size error
});

test('anonymous callers get 401 before any body is parsed', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { app } = await fixture();
  const get = await request(app).get('/api/admin/products');
  assert.equal(get.status, 401);
  const post = await request(app)
    .post('/api/admin/products')
    .send({ ...validBody, description: 'x'.repeat(30_000) });
  assert.equal(post.status, 401);
  assert.equal(
    (await request(app).delete('/api/admin/products/product-1')).status,
    401,
  );
});

test('customer service and customers get 403', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const { app, admin, state, seed } = await fixture();
  const product = seed();
  for (const role of ['CUSTOMER_SERVICE', 'CUSTOMER']) {
    state.role = role;
    const attempts = [
      request(app).get('/api/admin/products'),
      request(app).get(`/api/admin/products/${product.id}`),
      request(app).post('/api/admin/products').send(validBody),
      request(app).put(`/api/admin/products/${product.id}`).send(validBody),
      request(app).delete(`/api/admin/products/${product.id}`),
    ];
    for (const attempt of attempts) {
      assert.equal((await admin(attempt)).status, 403, role);
    }
  }
  assert.equal(state.products.size, 1);
});

test('admin can update a product and replace its image', async () => {
  const { app, admin, seed } = await fixture();
  const product = seed();
  const newImage = pngUrl;
  const response = await admin(
    request(app)
      .put(`/api/admin/products/${product.id}`)
      .send({
        ...validBody,
        name: 'Floor Lamp',
        price: 49.5,
        stock: 3,
        image: newImage,
      }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.body.product.id, product.id);
  assert.equal(response.body.product.name, 'Floor Lamp');
  assert.equal(response.body.product.price, 49.5);
  assert.equal(response.body.product.stock, 3);
  assert.equal(response.body.product.image, newImage);
});

test('updating without an image keeps the old image', async () => {
  const { app, admin, seed } = await fixture();
  const product = seed();
  const { image: _image, ...withoutImage } = validBody;
  const response = await admin(
    request(app)
      .put(`/api/admin/products/${product.id}`)
      .send({ ...withoutImage, name: 'Renamed' }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.product.name, 'Renamed');
  assert.equal(response.body.product.image, pngUrl);

  const fetched = await admin(
    request(app).get(`/api/admin/products/${product.id}`),
  );
  assert.equal(fetched.body.product.image, pngUrl);
});

test('update rejects bad input and unknown ids', async () => {
  const { app, admin, seed } = await fixture();
  const product = seed();
  const invalid = await admin(
    request(app)
      .put(`/api/admin/products/${product.id}`)
      .send({ ...validBody, stock: -5 }),
  );
  assert.equal(invalid.status, 400);

  const badImage = await admin(
    request(app)
      .put(`/api/admin/products/${product.id}`)
      .send({ ...validBody, image: 'data:image/png;base64,AAAA' }),
  );
  assert.equal(badImage.status, 400);

  const missing = await admin(
    request(app).put('/api/admin/products/nope').send(validBody),
  );
  assert.equal(missing.status, 404);
});

test('deleting an ordered product returns 409 and keeps it', async () => {
  const { app, admin, state, seed } = await fixture();
  const product = seed();
  state.orderedIds.add(product.id);
  state.basketRows.push({ productId: product.id });
  const response = await admin(
    request(app).delete(`/api/admin/products/${product.id}`),
  );
  assert.equal(response.status, 409);
  assert.deepEqual(response.body, { message: orderedMessage });
  assert.ok(state.products.has(product.id));
  assert.equal(state.basketRows.length, 1);
});

test('deleting an unordered product also clears its basket rows', async () => {
  const { app, admin, state, seed } = await fixture();
  const product = seed();
  const other = seed({ name: 'Other' });
  state.basketRows.push(
    { productId: product.id },
    { productId: product.id },
    { productId: other.id },
  );
  const response = await admin(
    request(app).delete(`/api/admin/products/${product.id}`),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { message: 'Product deleted.' });
  assert.equal(state.products.has(product.id), false);
  assert.deepEqual(state.basketRows, [{ productId: other.id }]);
});

test('deleting retries when a basket item is inserted during cleanup', async () => {
  const { app, admin, state, seed } = await fixture();
  const product = seed();
  state.raceNextBasketInsert = product.id;

  const response = await admin(
    request(app).delete(`/api/admin/products/${product.id}`),
  );

  assert.equal(response.status, 200);
  assert.equal(state.transactionAttempts, 2);
  assert.equal(state.products.has(product.id), false);
  assert.deepEqual(state.basketRows, []);
});

test('deleting an unknown product returns 404', async () => {
  const { app, admin } = await fixture();
  const response = await admin(request(app).delete('/api/admin/products/nope'));
  assert.equal(response.status, 404);
  assert.equal(typeof response.body.message, 'string');
});
