import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { Product } from '../models/product';
import {
  findProducts,
  type ProductSearchResult,
} from '../models/productSearch';

const productSelect = {
  id: true,
  name: true,
  description: true,
  imageUrl: true,
  unitPricePence: true,
  keywords: true,
  isInStock: true,
} satisfies Prisma.ProductSelect;

export class ProductService {
  private readonly database: PrismaClient;

  constructor(database: PrismaClient) {
    this.database = database;
  }

  /**
   * Typo-tolerant matching needs every product's words, so the whole catalogue
   * is loaded (in catalogue order, like the frontend) and matched in memory.
   * This suits the current small catalogue; a large one would need
   * database-side search (e.g. pg_trgm) instead.
   */
  async searchProducts(searchTerm: string): Promise<ProductSearchResult> {
    if (searchTerm.trim() === '') {
      return { products: [], isClosestMatch: false };
    }
    const records = await this.database.product.findMany({
      select: productSelect,
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    });
    return findProducts(
      records.map((record) => new Product(record)),
      searchTerm,
    );
  }
}
