import type { Prisma } from '../src/generated/prisma/client';

const productSelect = {
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

type CatalogDatabase = {
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

export function createCatalogRepository(database: CatalogDatabase) {
  return {
    async findAll(): Promise<CatalogProduct[]> {
      return database.product.findMany({
        orderBy: { name: 'asc' },
        select: productSelect,
      });
    },
    async findById(id: string): Promise<CatalogProduct | null> {
      return database.product.findUnique({
        where: { id },
        select: productSelect,
      });
    },
  };
}

export type CatalogRepository = ReturnType<typeof createCatalogRepository>;
