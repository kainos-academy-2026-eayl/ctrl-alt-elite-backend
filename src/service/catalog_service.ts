import type { CatalogProduct } from '../models/catalog_model';
import { detectImageType } from '../models/product_image';
import { findProducts } from '../models/product_search_model';
import type { CatalogRepository } from '../repo/catalog_repository';

/** The product shape the frontend's search page expects. */
export interface ProductSearchItemDto {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  /** Price in pounds as a 2 decimal place string, e.g. "24.99". */
  price: string;
  keywords: string[];
  isInStock: boolean;
}

export interface ProductSearchResultDto {
  products: ProductSearchItemDto[];
  isClosestMatch: boolean;
}

/** Turns stored image bytes into a data: URL the browser can show directly. */
function toImageDataUrl(imageBytes: Uint8Array): string {
  const image = Buffer.from(imageBytes);
  const mimeType = detectImageType(image);
  if (!mimeType) {
    throw new Error('Product image must contain PNG, JPEG, WebP or SVG data.');
  }
  return `data:${mimeType};base64,${image.toString('base64')}`;
}

export function serializeProduct(product: CatalogProduct) {
  return { ...product, image: toImageDataUrl(product.image) };
}

function toSearchItem(product: CatalogProduct): ProductSearchItemDto {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    imageUrl: toImageDataUrl(product.image),
    price: product.price.toFixed(2),
    keywords: [product.category],
    isInStock: product.stock > 0,
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
    /**
     * Typo-tolerant matching needs every product's words, so the catalogue is
     * matched in memory. This suits the current small catalogue; a large one
     * would need database-side search (e.g. pg_trgm) instead.
     */
    async search(searchTerm: string): Promise<ProductSearchResultDto> {
      if (searchTerm === '') {
        return { products: [], isClosestMatch: false };
      }
      const result = findProducts(await repository.findAll(), searchTerm);
      return {
        products: result.products.map(toSearchItem),
        isClosestMatch: result.isClosestMatch,
      };
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
