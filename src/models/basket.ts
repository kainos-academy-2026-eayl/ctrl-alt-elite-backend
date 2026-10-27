import { z } from 'zod';

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

const basketIdMessage = 'Basket id must be a valid UUID.';
const productIdMessage =
  'Product id is required and must be at most 100 characters.';
const quantityMessage = `Quantity must be a whole number from 1 to ${MAX_QUANTITY}.`;
const changeMessage = `Change must be a whole number from -${MAX_QUANTITY} to ${MAX_QUANTITY}, but not 0.`;

export const BasketIdSchema = z.uuid({ error: basketIdMessage });

export const ProductIdSchema = z
  .string({ error: productIdMessage })
  .trim()
  .min(1, productIdMessage)
  .max(100, productIdMessage);

export const BasketParamsSchema = z.object({ basketId: BasketIdSchema });

export const BasketItemParamsSchema = z.object({
  basketId: BasketIdSchema,
  productId: ProductIdSchema,
});

// Only the product id is accepted. Any name or price sent by the client is
// ignored because those always come from the server-side product catalogue.
export const AddBasketItemSchema = z.object(
  { productId: ProductIdSchema },
  { error: 'Request body must be a JSON object.' },
);

export const UpdateBasketItemSchema = z
  .object(
    {
      quantity: z
        .int({ error: quantityMessage })
        .min(1, quantityMessage)
        .max(MAX_QUANTITY, quantityMessage)
        .optional(),
      change: z
        .int({ error: changeMessage })
        .min(-MAX_QUANTITY, changeMessage)
        .max(MAX_QUANTITY, changeMessage)
        .refine((change) => change !== 0, changeMessage)
        .optional(),
    },
    { error: 'Request body must be a JSON object.' },
  )
  .transform((body, context): QuantityUpdate => {
    if (body.quantity !== undefined && body.change === undefined) {
      return { quantity: body.quantity };
    }
    if (body.change !== undefined && body.quantity === undefined) {
      return { change: body.change };
    }
    context.issues.push({
      code: 'custom',
      message: 'Send either quantity or change, but not both.',
      input: body,
    });
    return z.NEVER;
  });

export type AddBasketItemRequestDto = z.infer<typeof AddBasketItemSchema>;
export type UpdateBasketItemRequestDto = z.input<typeof UpdateBasketItemSchema>;

/** Matches the frontend's BasketLine: `id` is the product id. */
export interface BasketLineResponseDto {
  id: string;
  name: string;
  unitPricePence: number;
  quantity: number;
  lineTotalPence: number;
}

export interface BasketResponseDto {
  id: string;
  items: BasketLineResponseDto[];
  itemCount: number;
  totalPence: number;
  maxQuantity: number;
}

export function toBasketLineResponse(line: BasketLine): BasketLineResponseDto {
  return {
    id: line.productId,
    name: line.name,
    unitPricePence: line.unitPricePence,
    quantity: line.quantity,
    lineTotalPence: line.lineTotalPence,
  };
}

export function toBasketResponse(basket: Basket): BasketResponseDto {
  return {
    id: basket.id,
    items: basket.lines.map(toBasketLineResponse),
    itemCount: basket.itemCount,
    totalPence: basket.totalPence,
    maxQuantity: MAX_QUANTITY,
  };
}
