import type { CatalogProduct } from '../models/catalog_model';
import type { PopularProduct } from '../models/popular_products_model';
import {
  type AppliedFiltersDto,
  buildFacets,
  DEFAULT_FILTERS,
  filterProducts,
  type ProductFacetsDto,
  type ProductFilters,
  sortProducts,
  toAppliedFilters,
} from '../models/product_filter_model';
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
  category: string;
  isInStock: boolean;
}

/** Filter options for the matched products, and the filters that were applied. */
export interface FilteredListDto {
  facets: ProductFacetsDto;
  appliedFilters: AppliedFiltersDto;
}

export interface ProductSearchResultDto extends FilteredListDto {
  products: ProductSearchItemDto[];
  isClosestMatch: boolean;
}

/** The slim product shape the homepage conveyor belt needs. */
export interface PopularProductDto {
  id: string;
  name: string;
  /** Price in pounds as a 2 decimal place string, e.g. "24.99". */
  price: string;
  imageUrl: string;
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
    category: product.category,
    isInStock: product.stock > 0 && !product.outOfStock,
  };
}

function toPopularProduct(product: PopularProduct): PopularProductDto {
  return {
    id: product.id,
    name: product.name,
    price: product.price.toFixed(2),
    imageUrl: toImageDataUrl(product.image),
  };
}

export function createCatalogService(repository: CatalogRepository) {
  /** Filters and sorts products that are already in their recommended order. */
  async function applyFilters(
    products: CatalogProduct[],
    filters: ProductFilters,
  ): Promise<{ products: CatalogProduct[] } & FilteredListDto> {
    const unitsSold =
      filters.sort === 'most-bought'
        ? await repository.findUnitsSold()
        : undefined;
    return {
      products: sortProducts(
        filterProducts(products, filters),
        filters.sort,
        unitsSold,
      ),
      facets: buildFacets(products, filters),
      appliedFilters: toAppliedFilters(filters),
    };
  }

  return {
    /** Every product, in name order unless another sort is asked for. */
    async getAll(filters: ProductFilters = DEFAULT_FILTERS) {
      const result = await applyFilters(await repository.findAll(), filters);
      return { ...result, products: result.products.map(serializeProduct) };
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
    async search(
      searchTerm: string,
      filters: ProductFilters = DEFAULT_FILTERS,
    ): Promise<ProductSearchResultDto> {
      const matches =
        searchTerm === ''
          ? { products: [], isClosestMatch: false }
          : findProducts(await repository.findAll(), searchTerm);
      const result = await applyFilters(matches.products, filters);
      return {
        ...result,
        products: result.products.map(toSearchItem),
        isClosestMatch: matches.isClosestMatch,
      };
    },
    /**
     * Best sellers come first. If too few products have been ordered (e.g. a
     * fresh database), the rest of the slots are filled with the newest
     * in-stock products so the conveyor is never empty.
     */
    async getPopular(limit: number): Promise<PopularProductDto[]> {
      const topSellerIds = await repository.findTopSellingIds(limit);
      const topSellers =
        topSellerIds.length > 0
          ? await repository.findInStockByIds(topSellerIds)
          : [];
      const topSellersById = new Map(topSellers.map((p) => [p.id, p]));
      const ranked = topSellerIds.flatMap((id) => topSellersById.get(id) ?? []);

      const remaining = limit - ranked.length;
      const fillers =
        remaining > 0
          ? await repository.findNewestInStock(topSellerIds, remaining)
          : [];

      return [...ranked, ...fillers].map(toPopularProduct);
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
