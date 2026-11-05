/*
 * Filtering and sorting for GET /api/products and GET /api/products/search.
 *
 * Query parameters (all optional, and any can be combined):
 *   stock=in, stock=out       only in-stock and/or out-of-stock products
 *   category=Hats (repeat)    products in any of these categories
 *   minPrice=10, maxPrice=25  price range in pounds, inclusive
 *   sort=price-asc            one of SORT_OPTIONS (default "recommended")
 *
 * Like the search term, bad values are ignored rather than rejected, so a
 * hand-edited URL still shows results.
 */

export const SORT_OPTIONS = [
  'recommended',
  'price-asc',
  'price-desc',
  'newest',
  'oldest',
  'most-bought',
  'name-asc',
  'name-desc',
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number];

export const STOCK_OPTIONS = ['in', 'out'] as const;
export type StockOption = (typeof STOCK_OPTIONS)[number];

const MAX_CATEGORIES = 20;
const MAX_CATEGORY_LENGTH = 100;
const MAX_PRICE_PENCE = 100_000_000_00;

export interface ProductFilters {
  stock: StockOption[];
  categories: string[];
  /** Whole pence, or null for no limit. */
  minPricePence: number | null;
  maxPricePence: number | null;
  sort: SortOption;
}

/** The fields filtering and sorting need. */
export interface FilterableProduct {
  id: string;
  category: string;
  name: string;
  price: number;
  stock: number;
  outOfStock: boolean;
  createdAt: Date;
}

export interface ProductFacetsDto {
  /** How many products matched before any filter was applied. */
  total: number;
  /**
   * Every category in the matched products. Each count respects the other
   * active filters (stock and price) but not the category filter itself, so
   * it shows how many results ticking that box would add.
   */
  categories: { name: string; count: number }[];
  /** Counts that respect the category and price filters. */
  stock: { in: number; out: number };
  /** Cheapest and dearest matched product, in pounds, e.g. "8.99". */
  priceRange: { min: string; max: string } | null;
}

export interface AppliedFiltersDto {
  stock: StockOption[];
  categories: string[];
  minPrice: string | null;
  maxPrice: string | null;
  sort: SortOption;
}

export const DEFAULT_FILTERS: ProductFilters = {
  stock: [],
  categories: [],
  minPricePence: null,
  maxPricePence: null,
  sort: 'recommended',
};

/** A query value can be missing, a string, or an array when repeated. */
function values(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter((value): value is string => typeof value === 'string');
}

function readPence(raw: unknown): number | null {
  const [value] = values(raw);
  const trimmed = value?.trim().replace(/^£/, '') ?? '';
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const pence = Math.round(Number(trimmed) * 100);
  return pence <= MAX_PRICE_PENCE ? pence : null;
}

export function parseProductFilters(
  query: Record<string, unknown>,
): ProductFilters {
  const stock = STOCK_OPTIONS.filter((option) =>
    values(query.stock).includes(option),
  );
  const categories = [
    ...new Set(
      values(query.category)
        .map((category) => category.trim())
        .filter(
          (category) =>
            category !== '' && category.length <= MAX_CATEGORY_LENGTH,
        ),
    ),
  ].slice(0, MAX_CATEGORIES);
  let minPricePence = readPence(query.minPrice);
  let maxPricePence = readPence(query.maxPrice);
  // A reversed range is treated as the range the customer meant.
  if (
    minPricePence !== null &&
    maxPricePence !== null &&
    minPricePence > maxPricePence
  ) {
    [minPricePence, maxPricePence] = [maxPricePence, minPricePence];
  }
  const [sort] = values(query.sort);
  return {
    stock,
    categories,
    minPricePence,
    maxPricePence,
    sort: (SORT_OPTIONS as readonly string[]).includes(sort ?? '')
      ? (sort as SortOption)
      : 'recommended',
  };
}

function toPence(pounds: number): number {
  return Math.round(pounds * 100);
}

function poundsText(pence: number): string {
  return (pence / 100).toFixed(2);
}

function isInStock(product: FilterableProduct): boolean {
  return product.stock > 0 && !product.outOfStock;
}

function matchesStock(product: FilterableProduct, filters: ProductFilters) {
  // Ticking both boxes, or neither, shows everything.
  if (filters.stock.length !== 1) return true;
  return filters.stock[0] === 'in' ? isInStock(product) : !isInStock(product);
}

function matchesCategory(product: FilterableProduct, filters: ProductFilters) {
  return (
    filters.categories.length === 0 ||
    filters.categories.includes(product.category)
  );
}

function matchesPrice(product: FilterableProduct, filters: ProductFilters) {
  const pence = toPence(product.price);
  return (
    (filters.minPricePence === null || pence >= filters.minPricePence) &&
    (filters.maxPricePence === null || pence <= filters.maxPricePence)
  );
}

const byName = (a: FilterableProduct, b: FilterableProduct) =>
  a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' });

/**
 * Sorts a copy. "recommended" keeps the order the products were given in
 * (search relevance, or name), with in-stock products first. Ties fall back
 * to the product name.
 */
export function sortProducts<T extends FilterableProduct>(
  products: readonly T[],
  sort: SortOption,
  unitsSold: ReadonlyMap<string, number> = new Map(),
): T[] {
  const sorted = [...products];
  const compare: Record<SortOption, (a: T, b: T) => number> = {
    recommended: (a, b) => Number(isInStock(b)) - Number(isInStock(a)),
    'price-asc': (a, b) => toPence(a.price) - toPence(b.price) || byName(a, b),
    'price-desc': (a, b) => toPence(b.price) - toPence(a.price) || byName(a, b),
    newest: (a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime() || byName(a, b),
    oldest: (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() || byName(a, b),
    'most-bought': (a, b) =>
      (unitsSold.get(b.id) ?? 0) - (unitsSold.get(a.id) ?? 0) || byName(a, b),
    'name-asc': byName,
    'name-desc': (a, b) => byName(b, a),
  };
  return sorted.sort(compare[sort]);
}

export function filterProducts<T extends FilterableProduct>(
  products: readonly T[],
  filters: ProductFilters,
): T[] {
  return products.filter(
    (product) =>
      matchesStock(product, filters) &&
      matchesCategory(product, filters) &&
      matchesPrice(product, filters),
  );
}

export function buildFacets(
  products: readonly FilterableProduct[],
  filters: ProductFilters,
): ProductFacetsDto {
  const categoryCounts = new Map<string, number>();
  for (const product of products) {
    if (!categoryCounts.has(product.category)) {
      categoryCounts.set(product.category, 0);
    }
    if (matchesStock(product, filters) && matchesPrice(product, filters)) {
      categoryCounts.set(
        product.category,
        (categoryCounts.get(product.category) ?? 0) + 1,
      );
    }
  }

  const stock = { in: 0, out: 0 };
  for (const product of products) {
    if (matchesCategory(product, filters) && matchesPrice(product, filters)) {
      stock[isInStock(product) ? 'in' : 'out'] += 1;
    }
  }

  // Pounds, not pence: very large prices lose precision when multiplied.
  const prices = products.map((product) => product.price);
  return {
    total: products.length,
    categories: [...categoryCounts]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en-GB')),
    stock,
    priceRange:
      prices.length > 0
        ? {
            min: Math.min(...prices).toFixed(2),
            max: Math.max(...prices).toFixed(2),
          }
        : null,
  };
}

export function toAppliedFilters(filters: ProductFilters): AppliedFiltersDto {
  return {
    stock: filters.stock,
    categories: filters.categories,
    minPrice:
      filters.minPricePence === null ? null : poundsText(filters.minPricePence),
    maxPrice:
      filters.maxPricePence === null ? null : poundsText(filters.maxPricePence),
    sort: filters.sort,
  };
}
