import type { Product } from '../models/product';
import type { ProductSearchResult } from '../models/productSearch';

/** Exactly the frontend's Product, with the price as a "24.99" string. */
export interface ProductResponseDto {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  price: string;
  keywords: string[];
  isInStock: boolean;
}

/** Exactly what the frontend passes to its search page. */
export interface ProductSearchResponseDto {
  searchTerm: string;
  products: ProductResponseDto[];
  isClosestMatch: boolean;
}

export function toProductResponse(product: Product): ProductResponseDto {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    imageUrl: product.imageUrl,
    price: product.price,
    keywords: [...product.keywords],
    isInStock: product.isInStock,
  };
}

export function toProductSearchResponse(
  searchTerm: string,
  result: ProductSearchResult,
): ProductSearchResponseDto {
  return {
    searchTerm,
    products: result.products.map(toProductResponse),
    isClosestMatch: result.isClosestMatch,
  };
}
