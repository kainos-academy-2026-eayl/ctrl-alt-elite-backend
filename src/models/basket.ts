export const MAX_QUANTITY = 99;

/** Either set an exact quantity, or move it by `change` (clamped to 1–99). */
export type QuantityUpdate = { quantity: number } | { change: number };

export class BasketLine {
  public readonly productId: string;
  public readonly name: string;
  public readonly unitPricePence: number;
  public readonly quantity: number;

  constructor(
    productId: string,
    name: string,
    unitPricePence: number,
    quantity: number,
  ) {
    if (productId.trim() === '') {
      throw new Error('A basket line must have a product id.');
    }
    if (name.trim() === '') {
      throw new Error('A basket line must have a product name.');
    }
    if (!Number.isInteger(unitPricePence) || unitPricePence < 0) {
      throw new Error('Unit price must be a whole number of pence, 0 or more.');
    }
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_QUANTITY
    ) {
      throw new Error(
        `Quantity must be a whole number from 1 to ${MAX_QUANTITY}.`,
      );
    }

    this.productId = productId;
    this.name = name;
    this.unitPricePence = unitPricePence;
    this.quantity = quantity;
  }

  get lineTotalPence(): number {
    return this.unitPricePence * this.quantity;
  }
}

export class Basket {
  public readonly id: string;
  public readonly lines: readonly BasketLine[];

  constructor(id: string, lines: readonly BasketLine[]) {
    if (id.trim() === '') {
      throw new Error('A basket must have an id.');
    }
    this.id = id;
    this.lines = lines;
  }

  get itemCount(): number {
    return this.lines.reduce((sum, line) => sum + line.quantity, 0);
  }

  get totalPence(): number {
    return this.lines.reduce((sum, line) => sum + line.lineTotalPence, 0);
  }
}

export function maxQuantityMessage(productName: string): string {
  return `You already have the maximum of ${MAX_QUANTITY} × ${productName} in your basket`;
}
