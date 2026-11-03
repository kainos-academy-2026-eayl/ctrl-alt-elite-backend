import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';

const maxQuantity = 1_000_000;
const bodyError = { error: 'Request body must be a JSON object.' };

export const inventorySelect = {
  id: true,
  name: true,
  category: true,
  stock: true,
  lowStockThreshold: true,
  outOfStock: true,
} as const satisfies Prisma.ProductSelect;

export type InventoryRecord = Prisma.ProductGetPayload<{
  select: typeof inventorySelect;
}>;

export type InventoryStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface InventoryItem extends InventoryRecord {
  status: InventoryStatus;
  lowStock: boolean;
}

const wholeNumber = (label: string) =>
  z
    .number({ error: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .min(0, `${label} must be between 0 and 1,000,000.`)
    .max(maxQuantity, `${label} must be between 0 and 1,000,000.`);

export const stockUpdateSchema = z.object(
  {
    stock: wholeNumber('Stock'),
    lowStockThreshold: wholeNumber('Low stock threshold').optional(),
  },
  bodyError,
);

export const outOfStockUpdateSchema = z.object(
  {
    outOfStock: z.boolean({ error: 'outOfStock must be true or false.' }),
  },
  bodyError,
);

export type StockUpdate = z.output<typeof stockUpdateSchema>;
export type OutOfStockUpdate = z.output<typeof outOfStockUpdateSchema>;

/** Out of stock wins; otherwise low stock means at or below the product's own threshold. */
export function toInventoryItem(record: InventoryRecord): InventoryItem {
  const soldOut = record.outOfStock || record.stock === 0;
  const lowStock = soldOut || record.stock <= record.lowStockThreshold;
  let status: InventoryStatus = 'IN_STOCK';
  if (soldOut) status = 'OUT_OF_STOCK';
  else if (lowStock) status = 'LOW_STOCK';
  return { ...record, status, lowStock };
}
