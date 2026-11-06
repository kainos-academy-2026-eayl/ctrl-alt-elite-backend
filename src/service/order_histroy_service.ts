import type { Order } from '../models/order_histroy_model';
import type { OrderHistoryRepository } from '../repo/order_history_repository';

export interface OrderHistoryService {
  getAll(customerId: string): Promise<Order[]>;
}

export function createOrderHistoryService(repository: OrderHistoryRepository) {
  return {
    async getAll(customerId: string) {
      return repository.findAll(customerId);
    },
  };
}
