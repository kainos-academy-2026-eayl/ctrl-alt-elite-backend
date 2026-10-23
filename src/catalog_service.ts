import type { CatalogProduct, CatalogRepository } from './catalog_repository';

function serializeProduct(product: CatalogProduct) {
  const image = Buffer.from(product.image);
  let mimeType: string;
  if (image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    mimeType = 'image/png';
  } else if (image.toString('utf8').trimStart().startsWith('<svg ')) {
    mimeType = 'image/svg+xml';
  } else {
    throw new Error('Product image must contain PNG or SVG data.');
  }

  return {
    ...product,
    image: `data:${mimeType};base64,${image.toString('base64')}`,
  };
}

export function createCatalogService(repository: CatalogRepository) {
  return {
    async getAll() {
      const products = await repository.findAll();
      return products.map(serializeProduct);
    },
    async getById(id: string) {
      const product = await repository.findById(id);
      return product ? serializeProduct(product) : null;
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
