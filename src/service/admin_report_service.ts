import { ORDER_STATUSES } from '../models/admin_order_model';
import type { SalesReportQuery } from '../models/admin_report_model';
import type { AdminReportRepository } from '../repo/admin_report_repository';

function statusRank(status: string): number {
  const index = (ORDER_STATUSES as readonly string[]).indexOf(status);
  return index === -1 ? ORDER_STATUSES.length : index;
}

export function createAdminReportService(repository: AdminReportRepository) {
  return {
    async sales(query: SalesReportQuery) {
      const { statuses, unitsSold, daily, top } = await repository.sales(query);

      const dailySales = daily.map((row) => ({
        date: row.date,
        orders: Number(row.orders),
        revenuePence: Number(row.revenuePence),
      }));
      const totalOrders = dailySales.reduce((sum, day) => sum + day.orders, 0);
      const totalRevenuePence = dailySales.reduce(
        (sum, day) => sum + day.revenuePence,
        0,
      );

      return {
        range: { from: query.from, to: query.to },
        summary: {
          totalOrders,
          totalRevenuePence,
          averageOrderValuePence:
            totalOrders === 0 ? 0 : Math.round(totalRevenuePence / totalOrders),
          unitsSold,
        },
        ordersByStatus: statuses
          .map((row) => ({ status: row.order_status, count: row._count._all }))
          .sort(
            (a, b) =>
              statusRank(a.status) - statusRank(b.status) ||
              a.status.localeCompare(b.status),
          ),
        dailySales,
        topProducts: top.map((row) => ({
          productId: row.productId,
          name: row.name,
          unitsSold: Number(row.unitsSold),
          revenuePence:
            row.revenuePence === null ? null : Number(row.revenuePence),
        })),
      };
    },
  };
}

export type AdminReportService = ReturnType<typeof createAdminReportService>;
