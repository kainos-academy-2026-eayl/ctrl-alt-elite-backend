import type { CatalogDatabase, CatalogProduct } from '../models/catalog_model';
import { productSelect } from '../models/catalog_model';
import {
  IN_STOCK,
  type PopularProduct,
  popularProductSelect,
} from '../models/popular_products_model';

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
    /** Units ordered of each product, for sorting by "most bought". */
    async findUnitsSold(): Promise<Map<string, number>> {
      const sales = await database.order_products.groupBy({
        by: ['product_id'],
        _sum: { amount: true },
        orderBy: { product_id: 'asc' },
      });
      return new Map(
        sales.map((sale) => [sale.product_id, sale._sum.amount ?? 0]),
      );
    },
    /** IDs of in-stock products with the most units ordered, best seller first. */
    async findTopSellingIds(limit: number): Promise<string[]> {
      const sales = await database.order_products.groupBy({
        by: ['product_id'],
        where: { product: IN_STOCK },
        _sum: { amount: true },
        orderBy: [{ _sum: { amount: 'desc' } }, { product_id: 'asc' }],
        take: limit,
      });
      return sales.map((sale) => sale.product_id);
    },
    async findInStockByIds(ids: string[]): Promise<PopularProduct[]> {
      return database.product.findMany({
        where: { id: { in: ids }, ...IN_STOCK },
        select: popularProductSelect,
      });
    },
    async findNewestInStock(
      excludeIds: string[],
      limit: number,
    ): Promise<PopularProduct[]> {
      return database.product.findMany({
        where: { id: { notIn: excludeIds }, ...IN_STOCK },
        orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
        take: limit,
        select: popularProductSelect,
      });
    },
  };
}

export type CatalogRepository = ReturnType<typeof createCatalogRepository>;
