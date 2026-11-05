import { z } from 'zod';
import type { Prisma, } from '../generated/prisma/client';

const orderItemSchema = z.strictObject({
  productId: z.string().uuid(),
  quantity: z.number().int().positive().safe(),
});

export const orderSchema = z
  .strictObject({
    items: z.array(orderItemSchema).nonempty(),
  })
  .refine(
    (data) => {
      const productIds = data.items.map((item) => item.productId);
      return new Set(productIds).size === productIds.length;
    },
    { message: 'Each product may appear only once.' },
  );

export const orderSelect = {
  id: true,
  customerId: true,
  createdAt: true,
  products: {
    select: {
      product_id: true,
      amount: true,
    },
  },
} as const satisfies Prisma.orderSelect;

export type Order = Prisma.orderGetPayload<{
  select: typeof orderSelect;
}>;


export type orderDatabase = {
  product: {
    findMany(args: {
      orderBy: { id: 'asc' };
      select: typeof orderSelect;
    }): PromiseLike<Order[]>;
    findUnique(args: {
      where: { id: string };
      select: typeof orderSelect;
    }): PromiseLike<Order | null>;
  };
} 

