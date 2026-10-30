import type { CatalogProduct } from '../models/catalog_model';
import { detectImageType } from '../models/product_image';
import type { CatalogRepository } from '../repo/catalog_repository';

export function serializeProduct(product: CatalogProduct) {
  const image = Buffer.from(product.image);
  const mimeType = detectImageType(image);
  if (!mimeType) {
    throw new Error('Product image must contain PNG, JPEG, WebP or SVG data.');
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
