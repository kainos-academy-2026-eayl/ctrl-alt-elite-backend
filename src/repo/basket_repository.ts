import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { Basket, BasketLine, MAX_QUANTITY } from '../models/basket';

const basketSelect = {
  id: true,
  items: {
    select: {
      quantity: true,
      product: { select: { id: true, name: true, price: true } },
    },
    orderBy: [{ addedAt: 'asc' }, { productId: 'asc' }],
  },
} satisfies Prisma.BasketSelect;

type BasketRecord = Prisma.BasketGetPayload<{ select: typeof basketSelect }>;

export class BasketRepository {
  private readonly database: PrismaClient;

  constructor(database: PrismaClient) {
    this.database = database;
  }

  async create(): Promise<Basket> {
    const basket = await this.database.basket.create({
      data: {},
      select: basketSelect,
    });
    return toBasket(basket);
  }

  async findById(basketId: string): Promise<Basket | null> {
    const basket = await this.database.basket.findUnique({
      where: { id: basketId },
      select: basketSelect,
    });
    return basket === null ? null : toBasket(basket);
  }

  async exists(basketId: string): Promise<boolean> {
    const basket = await this.database.basket.findUnique({
      where: { id: basketId },
      select: { id: true },
    });
    return basket !== null;
  }

  async findProductName(productId: string): Promise<string | null> {
    const product = await this.database.product.findUnique({
      where: { id: productId },
      select: { name: true },
    });
    return product?.name ?? null;
  }

  async findLineQuantity(
    basketId: string,
    productId: string,
  ): Promise<number | null> {
    const line = await this.database.basketItem.findUnique({
      where: { basketId_productId: { basketId, productId } },
      select: { quantity: true },
    });
    return line?.quantity ?? null;
  }

  /** Returns how many lines were updated (0 or 1). */
  async setLineQuantity(
    basketId: string,
    productId: string,
    quantity: number,
  ): Promise<number> {
    const result = await this.database.basketItem.updateMany({
      where: { basketId, productId },
      data: { quantity },
    });
    return result.count;
  }

  /**
   * Applies +/- changes in one statement so rapid clicks are never lost, and
   * clamps between 1 and MAX_QUANTITY like the frontend. Prisma's tagged
   * template sends every value as a query parameter, so this is injection-safe.
   * Returns how many lines were updated (0 or 1).
   */
  changeLineQuantity(
    basketId: string,
    productId: string,
    change: number,
  ): Promise<number> {
    return this.database.$executeRaw`
      UPDATE "BasketItem"
      SET "quantity" = LEAST(GREATEST("quantity" + ${change}::int, 1), ${MAX_QUANTITY}::int)
      WHERE "basketId" = ${basketId} AND "productId" = ${productId}`;
  }

  /**
   * Increments in a single conditional update so two quick clicks can never
   * push the quantity past MAX_QUANTITY. Returns true if a line was incremented.
   */
  async incrementLineBelowMax(
    basketId: string,
    productId: string,
  ): Promise<boolean> {
    const result = await this.database.basketItem.updateMany({
      where: { basketId, productId, quantity: { lt: MAX_QUANTITY } },
      data: { quantity: { increment: 1 } },
    });
    return result.count > 0;
  }

  /** Returns false if a simultaneous request already created the line. */
  async createLine(basketId: string, productId: string): Promise<boolean> {
    try {
      await this.database.basketItem.create({
        data: { basketId, productId, quantity: 1 },
      });
      return true;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return false;
      }
      throw error;
    }
  }

  /** Returns how many lines were deleted (0 or 1). */
  async deleteLine(basketId: string, productId: string): Promise<number> {
    const result = await this.database.basketItem.deleteMany({
      where: { basketId, productId },
    });
    return result.count;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

// Product prices are stored in pounds; rounding avoids float drift like 0.29 * 100.
function toPence(pounds: number): number {
  return Math.round(pounds * 100);
}

function toBasket(record: BasketRecord): Basket {
  return new Basket(
    record.id,
    record.items.map(
      (item) =>
        new BasketLine(
          item.product.id,
          item.product.name,
          toPence(item.product.price),
          item.quantity,
        ),
    ),
  );
}
