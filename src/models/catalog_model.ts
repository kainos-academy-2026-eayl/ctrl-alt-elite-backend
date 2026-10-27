import type { Prisma } from '../generated/prisma/client';

export const productSelect = {
  id: true,
  name: true,
  category: true,
  description: true,
  price: true,
  stock: true,
  image: true,
} as const satisfies Prisma.ProductSelect;

export type CatalogProduct = Prisma.ProductGetPayload<{
  select: typeof productSelect;
}>;

export type CatalogDatabase = {
  product: {
    findMany(args: {
      orderBy: { name: 'asc' };
      select: typeof productSelect;
    }): PromiseLike<CatalogProduct[]>;
    findUnique(args: {
      where: { id: string };
      select: typeof productSelect;
    }): PromiseLike<CatalogProduct | null>;
  };
};
