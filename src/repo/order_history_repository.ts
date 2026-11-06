import type { Order, orderDatabase } from '../models/order_histroy_model';
import { orderSelect } from '../models/order_histroy_model';

export function createOrderHistoryRepository(database: orderDatabase) {
  return {
    async findAll(customerId: string): Promise<Order[]> {
      return database.order.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        select: orderSelect,
      });
    },
    async findById(id: string, customerId: string): Promise<Order | null> {
      return database.order.findFirst({
        where: { id, customerId },
        select: orderSelect,
      });
    },
  };
}

export type OrderHistoryRepository = ReturnType<
  typeof createOrderHistoryRepository
>;
