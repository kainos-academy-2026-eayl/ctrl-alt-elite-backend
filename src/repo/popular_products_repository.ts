import {
  IN_STOCK,
  type PopularProduct,
  type PopularProductsDatabase,
  popularProductSelect,
} from '../models/popular_products_model';

export function createPopularProductsRepository(
  database: PopularProductsDatabase,
) {
  return {
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

export type PopularProductsRepository = ReturnType<
  typeof createPopularProductsRepository
>;
