/*
 * Rules for GET /api/products/popular, which feeds the homepage conveyor belt.
 * Products are ranked by total units ordered; only in-stock products are shown.
 */
import type { Prisma } from '../generated/prisma/client';

export const DEFAULT_POPULAR_LIMIT = 6;
export const MAX_POPULAR_LIMIT = 20;

export const popularProductSelect = {
  id: true,
  name: true,
  price: true,
  image: true,
} as const satisfies Prisma.ProductSelect;

export type PopularProduct = Prisma.ProductGetPayload<{
  select: typeof popularProductSelect;
}>;

export const IN_STOCK = { stock: { gt: 0 } } as const;

export type PopularProductsDatabase = {
  order_products: {
    groupBy(args: {
      by: ['product_id'];
      where: { product: typeof IN_STOCK };
      _sum: { amount: true };
      orderBy: [{ _sum: { amount: 'desc' } }, { product_id: 'asc' }];
      take: number;
    }): PromiseLike<{ product_id: string }[]>;
  };
  product: {
    findMany(args: {
      where: Prisma.ProductWhereInput;
      orderBy?: [{ createdAt: 'desc' }, { name: 'asc' }];
      take?: number;
      select: typeof popularProductSelect;
    }): PromiseLike<PopularProduct[]>;
  };
};

/** A missing or invalid `limit` falls back to the default rather than being rejected; large values are capped. */
export function normalisePopularLimit(rawLimit: unknown): number {
  if (typeof rawLimit !== 'string' || !/^\d+$/.test(rawLimit)) {
    return DEFAULT_POPULAR_LIMIT;
  }
  const limit = Number(rawLimit);
  if (limit < 1) return DEFAULT_POPULAR_LIMIT;
  return Math.min(limit, MAX_POPULAR_LIMIT);
}
