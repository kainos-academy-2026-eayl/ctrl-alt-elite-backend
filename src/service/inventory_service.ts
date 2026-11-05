import { NotFoundError } from '../errors/appErrors';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import { validateRequest } from '../middleware/validateRequest';
import {
  type InventoryItem,
  inventorySelect,
  type OutOfStockUpdate,
  outOfStockUpdateSchema,
  type StockUpdate,
  stockUpdateSchema,
  toInventoryItem,
} from '../models/inventory_model';

const notFoundMessage = 'Product not found.';

export function validateStockUpdate(body: unknown): StockUpdate {
  return validateRequest(stockUpdateSchema, body);
}

export function validateOutOfStockUpdate(body: unknown): OutOfStockUpdate {
  return validateRequest(outOfStockUpdateSchema, body);
}

export async function listInventory(
  database: PrismaClient,
): Promise<InventoryItem[]> {
  const products = await database.product.findMany({
    orderBy: { name: 'asc' },
    select: inventorySelect,
  });
  return products.map(toInventoryItem);
}

export async function listLowStock(
  database: PrismaClient,
): Promise<InventoryItem[]> {
  return lowStockOf(await listInventory(database));
}

function lowStockOf(items: InventoryItem[]): InventoryItem[] {
  return items
    .filter((item) => item.lowStock)
    .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));
}

export async function getInventoryDashboard(database: PrismaClient) {
  const items = await listInventory(database);
  const lowStockProducts = lowStockOf(items);
  return {
    summary: {
      totalProducts: items.length,
      inStock: items.filter((item) => item.status === 'IN_STOCK').length,
      lowStock: lowStockProducts.length,
      outOfStock: items.filter((item) => item.status === 'OUT_OF_STOCK').length,
      totalUnits: items.reduce((total, item) => total + item.stock, 0),
    },
    lowStockProducts,
  };
}

async function updateInventory(
  database: PrismaClient,
  id: string,
  data: Prisma.ProductUpdateInput,
): Promise<InventoryItem> {
  try {
    const product = await database.product.update({
      where: { id },
      data,
      select: inventorySelect,
    });
    return toInventoryItem(product);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundError(notFoundMessage);
    }
    throw error;
  }
}

export function updateStock(
  database: PrismaClient,
  id: string,
  input: StockUpdate,
) {
  const { stock, lowStockThreshold } = input;
  return updateInventory(
    database,
    id,
    lowStockThreshold === undefined ? { stock } : { stock, lowStockThreshold },
  );
}

export function setOutOfStock(
  database: PrismaClient,
  id: string,
  input: OutOfStockUpdate,
) {
  return updateInventory(database, id, { outOfStock: input.outOfStock });
}
