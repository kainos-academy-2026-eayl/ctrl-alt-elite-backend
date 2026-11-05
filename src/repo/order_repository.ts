import {
  InsufficientCreditError,
  InsufficientStockError,
  OrderProductNotFoundError,
} from '../errors/order_errors';
import type {
  Account,
  CreateOrderInput,
  DeliveryOption,
  Order,
  OrderDatabase,
} from '../models/order_model';
import { accountSelect, orderSelect, toPence } from '../models/order_model';

export interface PlacedOrder {
  order: Order;
  creditBalancePence: number;
}

export function createOrderRepository(database: OrderDatabase) {
  return {
    /**
     * Places the whole order or nothing: if any product is missing or short of
     * stock, or the customer's credit cannot cover the total, the transaction
     * rolls back every stock and credit change.
     */
    async create(
      customerId: string,
      input: CreateOrderInput,
      delivery: DeliveryOption,
    ): Promise<PlacedOrder> {
      return database.$transaction(async (tx) => {
        // A consistent product order reduces the risk of deadlocks.
        const sortedItems = [...input.items].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        );
        const products = await tx.product.findMany({
          where: { id: { in: sortedItems.map((item) => item.productId) } },
          select: { id: true, price: true, stock: true },
        });

        let itemsTotalPence = 0;
        const lines = sortedItems.map((item) => {
          const product = products.find(
            (candidate) => candidate.id === item.productId,
          );
          if (!product) {
            throw new OrderProductNotFoundError();
          }
          if (item.quantity > product.stock) {
            throw new InsufficientStockError();
          }
          const unitPricePence = toPence(product.price);
          itemsTotalPence += unitPricePence * item.quantity;
          return { ...item, unitPricePence };
        });

        // The stock check above can be out of date by now; this guarded
        // decrement is the final authority when two orders race.
        for (const line of lines) {
          const result = await tx.product.updateMany({
            where: { id: line.productId, stock: { gte: line.quantity } },
            data: { stock: { decrement: line.quantity } },
          });
          if (result.count !== 1) {
            throw new InsufficientStockError();
          }
        }

        const totalPence = itemsTotalPence + delivery.pricePence;
        const charged = await tx.user.updateMany({
          where: { id: customerId, creditBalancePence: { gte: totalPence } },
          data: { creditBalancePence: { decrement: totalPence } },
        });
        const customer = await tx.user.findUnique({
          where: { id: customerId },
          select: { creditBalancePence: true },
        });
        if (charged.count !== 1 || !customer) {
          throw new InsufficientCreditError(
            customer?.creditBalancePence ?? 0,
            totalPence,
          );
        }

        const order = await tx.order.create({
          data: {
            customerId,
            order_total: totalPence / 100,
            order_status: 'PENDING',
            first_name: input.customer.firstName,
            last_name: input.customer.lastName,
            email: input.customer.email,
            phone: input.customer.phone,
            address_line1: input.address.line1,
            address_line2: input.address.line2 ?? null,
            town: input.address.town,
            postcode: input.address.postcode,
            delivery_option: delivery.id,
            delivery_price_pence: delivery.pricePence,
            products: {
              create: lines.map((line) => ({
                product_id: line.productId,
                amount: line.quantity,
                unit_price_pence: line.unitPricePence,
              })),
            },
          },
          select: orderSelect,
        });

        return { order, creditBalancePence: customer.creditBalancePence };
      });
    },

    /** Only the customer who placed an order can see it. */
    findForCustomer(
      orderId: string,
      customerId: string,
    ): Promise<Order | null> {
      return database.order.findFirst({
        where: { id: orderId, customerId },
        select: orderSelect,
      });
    },

    findAccount(userId: string): Promise<Account | null> {
      return database.user.findUnique({
        where: { id: userId },
        select: accountSelect,
      });
    },
  };
}

export type OrderRepository = ReturnType<typeof createOrderRepository>;
