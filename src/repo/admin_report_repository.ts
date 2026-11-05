import { Prisma, type PrismaClient } from '../generated/prisma/client';
import type { SalesReportQuery } from '../models/admin_report_model';

export type AdminReportDatabase = Pick<PrismaClient, '$transaction'>;

export interface DailySalesRow {
  date: string;
  orders: number | bigint;
  revenuePence: number | bigint;
}

export interface TopProductRow {
  productId: string;
  name: string;
  unitsSold: number | bigint;
  revenuePence: number | bigint | null;
}

// order.createdAt is a UTC timestamp without time zone, so the bounds are
// bound as UTC text and cast, independent of the database session time zone.
function toSqlTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

export function createAdminReportRepository(database: AdminReportDatabase) {
  return {
    async sales({
      start,
      endExclusive,
    }: Pick<SalesReportQuery, 'start' | 'endExclusive'>) {
      const inRange = { createdAt: { gte: start, lt: endExclusive } };
      const from = toSqlTimestamp(start);
      const to = toSqlTimestamp(endExclusive);

      const { statuses, units, daily, top } = await database.$transaction(
        async (transaction) => {
          const [statuses, units, daily, top] = await Promise.all([
            transaction.order.groupBy({
              by: ['order_status'],
              where: inRange,
              _count: { _all: true },
            }),
            transaction.order_products.aggregate({
              _sum: { amount: true },
              where: {
                order: { ...inRange, order_status: { not: 'CANCELLED' } },
              },
            }),
            // order_total is a Float in pounds; casting to numeric before
            // multiplying avoids float drift when converting to pence.
            transaction.$queryRaw<DailySalesRow[]>`
              SELECT to_char("createdAt", 'YYYY-MM-DD') AS "date",
                     COUNT(*)::int AS "orders",
                     COALESCE(SUM(ROUND("order_total"::numeric * 100)), 0)::bigint AS "revenuePence"
              FROM "order"
              WHERE "createdAt" >= ${from}::timestamp
                AND "createdAt" < ${to}::timestamp
                AND "order_status" <> 'CANCELLED'
              GROUP BY 1
              ORDER BY 1 ASC`,
            transaction.$queryRaw<TopProductRow[]>`
              SELECT op."product_id" AS "productId",
                     p."name" AS "name",
                     SUM(op."amount")::bigint AS "unitsSold",
                     CASE WHEN BOOL_OR(o."delivery_option" IS NULL) THEN NULL
                          ELSE SUM(op."amount"::bigint * op."unit_price_pence")::bigint
                     END AS "revenuePence"
              FROM "order_products" op
              JOIN "order" o ON o."id" = op."order_id"
              JOIN "Product" p ON p."id" = op."product_id"
              WHERE o."createdAt" >= ${from}::timestamp
                AND o."createdAt" < ${to}::timestamp
                AND o."order_status" <> 'CANCELLED'
              GROUP BY op."product_id", p."name"
              ORDER BY "revenuePence" DESC NULLS LAST, p."name" ASC, op."product_id" ASC
              LIMIT 10`,
          ]);
          return { statuses, units, daily, top };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );

      return { statuses, unitsSold: units._sum.amount ?? 0, daily, top };
    },
  };
}

export type AdminReportRepository = ReturnType<
  typeof createAdminReportRepository
>;
