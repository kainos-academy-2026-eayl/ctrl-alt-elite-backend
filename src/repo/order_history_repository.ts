import type { orderDatabase, Order } from '../models/order_histroy_model';
import { orderSelect } from '../models/order_histroy_model';


export function createOrderHistoryRepository(database: orderDatabase) {
  return {
    async findAll(): Promise<Order[]> {
      return database.product.findMany({
        orderBy: { id: 'asc' },
        select: orderSelect,
      });
    },
    async findById(id: string): Promise<Order | null> {
      return database.product.findUnique({
        where: { id },
        select: orderSelect,
      });
    },
    
    
  };
}

export type OrderHistoryRepository = ReturnType<typeof createOrderHistoryRepository>;
