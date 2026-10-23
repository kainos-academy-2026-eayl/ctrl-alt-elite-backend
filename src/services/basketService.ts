import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../errors/appErrors';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import {
  Basket,
  BasketLine,
  MAX_QUANTITY,
  maxQuantityMessage,
  type QuantityUpdate,
} from '../models/basket';

export const BASKET_NOT_FOUND_MESSAGE =
  'Basket not found. Please start a new basket.';
export const PRODUCT_NOT_FOUND_MESSAGE = 'That product is not available.';
export const ITEM_NOT_FOUND_MESSAGE = 'That item is not in your basket.';

const basketSelect = {
  id: true,
  items: {
    select: {
      quantity: true,
      product: { select: { id: true, name: true, unitPricePence: true } },
    },
    orderBy: [{ addedAt: 'asc' }, { productId: 'asc' }],
  },
} satisfies Prisma.BasketSelect;

type BasketRecord = Prisma.BasketGetPayload<{ select: typeof basketSelect }>;

export interface AddItemResult {
  basket: Basket;
  isNewLine: boolean;
}

export class BasketService {
  private readonly database: PrismaClient;

  constructor(database: PrismaClient) {
    this.database = database;
  }

  async createBasket(): Promise<Basket> {
    const basket = await this.database.basket.create({
      data: {},
      select: basketSelect,
    });
    return toBasket(basket);
  }

  async getBasket(basketId: string): Promise<Basket> {
    const basket = await this.database.basket.findUnique({
      where: { id: basketId },
      select: basketSelect,
    });
    if (basket === null) {
      throw new NotFoundError(BASKET_NOT_FOUND_MESSAGE);
    }
    return toBasket(basket);
  }

  /** Adds one of a product, or one more if it is already in the basket. */
  async addItem(basketId: string, productId: string): Promise<AddItemResult> {
    await this.ensureBasketExists(basketId);
    const product = await this.database.product.findUnique({
      where: { id: productId },
      select: { name: true },
    });
    if (product === null) {
      throw new ValidationError([
        { field: 'productId', message: PRODUCT_NOT_FOUND_MESSAGE },
      ]);
    }

    const isNewLine = await this.incrementOrCreateLine(
      basketId,
      productId,
      product.name,
    );
    return { basket: await this.getBasket(basketId), isNewLine };
  }

  async updateItemQuantity(
    basketId: string,
    productId: string,
    update: QuantityUpdate,
  ): Promise<Basket> {
    const updatedCount =
      'change' in update
        ? await this.changeLineQuantity(basketId, productId, update.change)
        : (
            await this.database.basketItem.updateMany({
              where: { basketId, productId },
              data: { quantity: update.quantity },
            })
          ).count;
    if (updatedCount === 0) {
      await this.ensureBasketExists(basketId);
      throw new NotFoundError(ITEM_NOT_FOUND_MESSAGE);
    }
    return this.getBasket(basketId);
  }

  async removeItem(basketId: string, productId: string): Promise<void> {
    const deleted = await this.database.basketItem.deleteMany({
      where: { basketId, productId },
    });
    if (deleted.count === 0) {
      await this.ensureBasketExists(basketId);
      throw new NotFoundError(ITEM_NOT_FOUND_MESSAGE);
    }
  }

  private async ensureBasketExists(basketId: string): Promise<void> {
    const basket = await this.database.basket.findUnique({
      where: { id: basketId },
      select: { id: true },
    });
    if (basket === null) {
      throw new NotFoundError(BASKET_NOT_FOUND_MESSAGE);
    }
  }

  /**
   * Applies +/- changes in one statement so rapid clicks are never lost, and
   * clamps between 1 and MAX_QUANTITY like the frontend. Prisma's tagged
   * template sends every value as a query parameter, so this is injection-safe.
   */
  private changeLineQuantity(
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
   * push the quantity past MAX_QUANTITY. Returns true when a new line was made.
   */
  private async incrementOrCreateLine(
    basketId: string,
    productId: string,
    productName: string,
  ): Promise<boolean> {
    const incremented = await this.database.basketItem.updateMany({
      where: { basketId, productId, quantity: { lt: MAX_QUANTITY } },
      data: { quantity: { increment: 1 } },
    });
    if (incremented.count > 0) {
      return false;
    }

    const existing = await this.database.basketItem.findUnique({
      where: { basketId_productId: { basketId, productId } },
      select: { quantity: true },
    });
    if (existing !== null) {
      if (existing.quantity < MAX_QUANTITY) {
        return this.incrementOrCreateLine(basketId, productId, productName);
      }
      throw new ConflictError(maxQuantityMessage(productName));
    }

    try {
      await this.database.basketItem.create({
        data: { basketId, productId, quantity: 1 },
      });
      return true;
    } catch (error) {
      // A simultaneous request created the line first, so increment it instead.
      if (isUniqueConstraintError(error)) {
        return this.incrementOrCreateLine(basketId, productId, productName);
      }
      throw error;
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function toBasket(record: BasketRecord): Basket {
  return new Basket(
    record.id,
    record.items.map(
      (item) =>
        new BasketLine(
          item.product.id,
          item.product.name,
          item.product.unitPricePence,
          item.quantity,
        ),
    ),
  );
}
