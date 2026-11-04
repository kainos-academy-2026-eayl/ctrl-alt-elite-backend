import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../errors/appErrors';
import {
  type Basket,
  MAX_QUANTITY,
  maxQuantityMessage,
  type QuantityUpdate,
} from '../models/basket';
import type { BasketRepository } from '../repo/basket_repository';

export const BASKET_NOT_FOUND_MESSAGE =
  'Basket not found. Please start a new basket.';
export const PRODUCT_NOT_FOUND_MESSAGE = 'That product is not available.';
export const ITEM_NOT_FOUND_MESSAGE = 'That item is not in your basket.';

export function outOfStockMessage(productName: string): string {
  return `${productName} is out of stock.`;
}

export interface AddItemResult {
  basket: Basket;
  isNewLine: boolean;
}

export class BasketService {
  private readonly basketRepository: BasketRepository;

  constructor(basketRepository: BasketRepository) {
    this.basketRepository = basketRepository;
  }

  createBasket(): Promise<Basket> {
    return this.basketRepository.create();
  }

  async getBasket(basketId: string): Promise<Basket> {
    const basket = await this.basketRepository.findById(basketId);
    if (basket === null) {
      throw new NotFoundError(BASKET_NOT_FOUND_MESSAGE);
    }
    return basket;
  }

  /** Adds one of a product, or one more if it is already in the basket. */
  async addItem(basketId: string, productId: string): Promise<AddItemResult> {
    await this.ensureBasketExists(basketId);
    const product = await this.basketRepository.findProduct(productId);
    if (product === null) {
      throw new ValidationError([
        { field: 'productId', message: PRODUCT_NOT_FOUND_MESSAGE },
      ]);
    }
    if (product.outOfStock) {
      throw new ConflictError(outOfStockMessage(product.name));
    }
    const productName = product.name;

    const isNewLine = await this.incrementOrCreateLine(
      basketId,
      productId,
      productName,
    );
    return { basket: await this.getBasket(basketId), isNewLine };
  }

  async updateItemQuantity(
    basketId: string,
    productId: string,
    update: QuantityUpdate,
  ): Promise<Basket> {
    const currentQuantity =
      'quantity' in update || update.change > 0
        ? await this.basketRepository.findLineQuantity(basketId, productId)
        : null;
    const increasesQuantity =
      'quantity' in update
        ? currentQuantity !== null && update.quantity > currentQuantity
        : update.change > 0 &&
          currentQuantity !== null &&
          currentQuantity < MAX_QUANTITY;
    if (increasesQuantity) {
      const product = await this.basketRepository.findProduct(productId);
      if (product?.outOfStock) {
        throw new ConflictError(outOfStockMessage(product.name));
      }
    }

    const updatedCount =
      'change' in update
        ? await this.basketRepository.changeLineQuantity(
            basketId,
            productId,
            update.change,
          )
        : await this.basketRepository.setLineQuantity(
            basketId,
            productId,
            update.quantity,
          );
    if (updatedCount === 0) {
      await this.ensureBasketExists(basketId);
      throw new NotFoundError(ITEM_NOT_FOUND_MESSAGE);
    }
    return this.getBasket(basketId);
  }

  async removeItem(basketId: string, productId: string): Promise<void> {
    const deletedCount = await this.basketRepository.deleteLine(
      basketId,
      productId,
    );
    if (deletedCount === 0) {
      await this.ensureBasketExists(basketId);
      throw new NotFoundError(ITEM_NOT_FOUND_MESSAGE);
    }
  }

  private async ensureBasketExists(basketId: string): Promise<void> {
    if (!(await this.basketRepository.exists(basketId))) {
      throw new NotFoundError(BASKET_NOT_FOUND_MESSAGE);
    }
  }

  /** Returns true when a new line was made. */
  private async incrementOrCreateLine(
    basketId: string,
    productId: string,
    productName: string,
  ): Promise<boolean> {
    if (
      await this.basketRepository.incrementLineBelowMax(basketId, productId)
    ) {
      return false;
    }

    const existingQuantity = await this.basketRepository.findLineQuantity(
      basketId,
      productId,
    );
    if (existingQuantity !== null) {
      if (existingQuantity < MAX_QUANTITY) {
        return this.incrementOrCreateLine(basketId, productId, productName);
      }
      throw new ConflictError(maxQuantityMessage(productName));
    }

    if (await this.basketRepository.createLine(basketId, productId)) {
      return true;
    }
    // A simultaneous request created the line first, so increment it instead.
    return this.incrementOrCreateLine(basketId, productId, productName);
  }
}
