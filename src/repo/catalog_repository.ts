import type { CatalogDatabase, CatalogProduct } from '../models/catalog_model';
import { productSelect } from '../models/catalog_model';

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
