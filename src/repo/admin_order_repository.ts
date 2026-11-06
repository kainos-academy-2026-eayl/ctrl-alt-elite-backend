import type { PrismaClient } from '../generated/prisma/client';
import {
  type AdminOrderQuery,
  adminOrderDetailSelect,
  adminOrderListSelect,
  adminOrderOrderBy,
  buildAdminOrderWhere,
} from '../models/admin_order_model';

export type AdminOrderDatabase = Pick<PrismaClient, 'order'>;

export function createAdminOrderRepository(database: AdminOrderDatabase) {
  return {
    async findPage(query: AdminOrderQuery) {
      const where = buildAdminOrderWhere(query);
      const [rows, total] = await Promise.all([
        database.order.findMany({
          where,
          select: adminOrderListSelect,
          orderBy: [...adminOrderOrderBy[query.sort]],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        database.order.count({ where }),
      ]);
      return { rows, total };
    },

    findById(id: string) {
      return database.order.findUnique({
        where: { id },
        select: adminOrderDetailSelect,
      });
    },
  };
}

export type AdminOrderRepository = ReturnType<
  typeof createAdminOrderRepository
>;
