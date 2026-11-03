import type { OrderDatabase } from '../models/order_model';
import type { CreateOrderInput, Order } from '../models/order_model';
import { OrderValidationError, OrderProductNotFoundError, InsufficientStockError } from '../errors/order_errors';
import {orderSelect} from '../models/order_model';




export function createOrderRepository(database: OrderDatabase) {
  return {
    async create(
      customerId: string,
      input: CreateOrderInput,
    ): Promise<Order> {
      return database.$transaction(async (tx) => {
        const products = await tx.product.findMany({
            select: {
            id: true,
            price: true,
            stock: true,
        },
    });

    let totalMinorUnits = 0;

    const sortedItems = [...input.items].sort((a, b) =>
    a.productId.localeCompare(b.productId),
    );

    for (const item of sortedItems) {
    const product = products.find(
        (candidate) => candidate.id === item.productId,
    );

    if (!product) {
        throw new OrderProductNotFoundError();
    }

    if (item.quantity > product.stock) {
        throw new InsufficientStockError();
    }

    // Calculate this item's contribution to the total.
    totalMinorUnits += item.quantity * product.price;

    const unitPriceMinorUnits = Math.round(product.price * 100);
    const lineTotalMinorUnits =
    unitPriceMinorUnits * item.quantity;

    totalMinorUnits += lineTotalMinorUnits;

    const result = await tx.product.updateMany({
    where: {
        id: item.productId,
        stock: { gte: item.quantity },
    },
    data: {
        stock: { decrement: item.quantity },
    },
    });

        if (result.count !== 1) {
        throw new InsufficientStockError();
        }

    // Perform its guarded stock decrement.
    }

    const order_total = totalMinorUnits / 100;


    const order = await tx.order.create({
      data: {
        customerId,
        order_total: order_total,
        products: {
          create: sortedItems.map((item) => ({
            product_id: item.productId,
            amount: item.quantity,
          })),
        },
        order_status: 'PENDING',
      },
      select: orderSelect,
    });

    return order;


        // Read products.
        // Check for missing products and insufficient stock.
        // Calculate the total from database prices.
        // Perform guarded stock decrements.
        // Create and return the order with its items.
      });
    },
  };
}

export type OrderRepository =
  ReturnType<typeof createOrderRepository>;