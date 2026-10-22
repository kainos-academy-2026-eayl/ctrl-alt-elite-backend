import { z } from 'zod';
import {
  type Basket,
  type BasketLine,
  MAX_QUANTITY,
  type QuantityUpdate,
} from '../models/basket';

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
