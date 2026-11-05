import { OrderNotFoundError } from '../errors/order_errors';
import {
  type AdminOrderQuery,
  toAdminOrderDetail,
  toAdminOrderSummary,
} from '../models/admin_order_model';
import type { AdminOrderRepository } from '../repo/admin_order_repository';

export function createAdminOrderService(repository: AdminOrderRepository) {
  return {
    async list(query: AdminOrderQuery) {
      const { rows, total } = await repository.findPage(query);
      return {
        orders: rows.map(toAdminOrderSummary),
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      };
    },

    async get(id: string) {
      const row = await repository.findById(id);
      if (!row) {
        throw new OrderNotFoundError();
      }
      return { order: toAdminOrderDetail(row) };
    },
  };
}

export type AdminOrderService = ReturnType<typeof createAdminOrderService>;
