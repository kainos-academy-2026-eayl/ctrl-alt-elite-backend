import { z } from 'zod';
import type { Prisma, PrismaClient } from '../generated/prisma/client';

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
  order_total: true,
  order_status: true,
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

export type orderDatabase = Pick<PrismaClient, 'order'>;
