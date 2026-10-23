import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import {
  type CatalogProduct,
  createCatalogRepository,
} from '../src/catalog_repository';
import { createCatalogService } from '../src/catalog_service';

const product: CatalogProduct = {
  id: 'product-123',
  name: 'Desk Lamp',
  category: 'Home',
  description: 'A compact desk lamp.',
  price: 24.99,
  stock: 8,
  image: Buffer.from('89504e470d0a1a0a', 'hex'),
};

const expectedSelect = {
  id: true,
  name: true,
  category: true,
  description: true,
  price: true,
  stock: true,
  image: true,
};

test('repository selects catalogue fields and orders products by name', async () => {
  const findMany = mock.fn(async () => [product]);
  const repository = createCatalogRepository({
    product: { findMany, findUnique: async () => null },
  });

  assert.deepEqual(await repository.findAll(), [product]);
  assert.equal(findMany.mock.callCount(), 1);
  assert.deepEqual(findMany.mock.calls[0]?.arguments, [
    { select: expectedSelect, orderBy: { name: 'asc' } },
  ]);
});

test('repository selects a product using its ID', async () => {
  const findUnique = mock.fn(async () => product);
  const repository = createCatalogRepository({
    product: { findMany: async () => [], findUnique },
  });

  assert.equal(await repository.findById(product.id), product);
  assert.equal(findUnique.mock.callCount(), 1);
  assert.deepEqual(findUnique.mock.calls[0]?.arguments, [
    { select: expectedSelect, where: { id: product.id } },
  ]);
});

test('repository preserves empty lists and missing products', async () => {
  const repository = createCatalogRepository({
    product: {
      findMany: async () => [],
      findUnique: async () => null,
    },
  });

  assert.deepEqual(await repository.findAll(), []);
  assert.equal(await repository.findById('missing'), null);
});

test('repository propagates database failures from both queries', async () => {
  const failure = new Error('Database unavailable');
  const fail = async () => {
    throw failure;
  };
  const repository = createCatalogRepository({
    product: { findMany: fail, findUnique: fail },
  });

  await assert.rejects(repository.findAll(), (error) => error === failure);
  await assert.rejects(
    repository.findById(product.id),
    (error) => error === failure,
  );
});

for (const [mimeType, image] of [
  ['image/png', product.image],
  ['image/svg+xml', Buffer.from('  <svg xmlns="http://www.w3.org/2000/svg"/>')],
] as const) {
  test(`service serializes ${mimeType} images for lists and individual products`, async () => {
    const storedProduct = { ...product, image };
    const findById = mock.fn(async (_id: string) => storedProduct);
    const service = createCatalogService({
      findAll: async () => [storedProduct],
      findById,
    });
    const expected = {
      ...storedProduct,
      image: `data:${mimeType};base64,${Buffer.from(image).toString('base64')}`,
    };

    assert.deepEqual(await service.getAll(), [expected]);
    assert.deepEqual(await service.getById(product.id), expected);
    assert.deepEqual(findById.mock.calls[0]?.arguments, [product.id]);
    assert.equal(storedProduct.image, image);
  });
}

test('service preserves empty lists and missing products', async () => {
  const service = createCatalogService({
    findAll: async () => [],
    findById: async () => null,
  });

  assert.deepEqual(await service.getAll(), []);
  assert.equal(await service.getById('missing'), null);
});

test('service rejects unsupported images for both operations', async () => {
  const invalidProduct = { ...product, image: Buffer.from('not an image') };
  const service = createCatalogService({
    findAll: async () => [invalidProduct],
    findById: async () => invalidProduct,
  });
  const expected = /Product image must contain PNG or SVG data\./;

  await assert.rejects(service.getAll(), expected);
  await assert.rejects(service.getById(product.id), expected);
});

test('service propagates repository failures from both operations', async () => {
  const failure = new Error('Repository unavailable');
  const fail = async () => {
    throw failure;
  };
  const service = createCatalogService({ findAll: fail, findById: fail });

  await assert.rejects(service.getAll(), (error) => error === failure);
  await assert.rejects(
    service.getById(product.id),
    (error) => error === failure,
  );
});
