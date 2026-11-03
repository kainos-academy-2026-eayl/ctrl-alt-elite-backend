import { OrderValidationError } from '../errors/order_errors';
import { orderSchema, type Order } from '../models/order_model';
import type { OrderRepository } from '../repo/order_repository';

export function createOrderService(repository: OrderRepository) {
  return {
    async create(customerId: string, body: unknown): Promise<Order> {
      const result = orderSchema.safeParse(body);

      if (!result.success) {
        throw new OrderValidationError();
      }

      return repository.create(customerId, result.data);
    },
  };
}

export type OrderService = ReturnType<typeof createOrderService>;