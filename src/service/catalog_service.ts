import type {
  CatalogProduct,
  CatalogRepository,
} from '../repo/catalog_repository';

function serializeProduct(product: CatalogProduct) {
  const image = Buffer.from(product.image);
  let mimeType: string;
  if (image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    mimeType = 'image/png';
  } else if (image.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) {
    mimeType = 'image/jpeg';
  } else if (
    image.subarray(0, 4).equals(Buffer.from('RIFF')) &&
    image.subarray(8, 12).equals(Buffer.from('WEBP'))
  ) {
    mimeType = 'image/webp';
  } else if (image.toString('utf8').trimStart().startsWith('<svg ')) {
    mimeType = 'image/svg+xml';
  } else {
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
