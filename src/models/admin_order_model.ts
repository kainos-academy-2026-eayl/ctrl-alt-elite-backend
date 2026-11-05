import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { findDeliveryOption, toPence } from './order_model';

export const ORDER_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const;
export const ORDER_SORTS = [
  'newest',
  'oldest',
  'totalDesc',
  'totalAsc',
] as const;

function whole(label: string) {
  const message = `${label} must be a whole number.`;
  return z.string({ error: message }).regex(/^\d+$/, message).transform(Number);
}

export const adminOrderQuerySchema = z.object({
  search: z
    .string({ error: 'Search must be text.' })
    .trim()
    .max(200, 'Search must be at most 200 characters.')
    .transform((search) => search || undefined)
    .optional(),
  status: z
    .enum(ORDER_STATUSES, {
      error: `Status must be one of ${ORDER_STATUSES.join(', ')}.`,
    })
    .optional(),
  sort: z
    .enum(ORDER_SORTS, {
      error: `Sort must be one of ${ORDER_SORTS.join(', ')}.`,
    })
    .default('newest'),
  page: whole('Page')
    .pipe(
      z
        .number()
        .min(1, 'Page must be at least 1.')
        .max(1_000_000, 'Page is too large.'),
    )
    .default(1),
  pageSize: whole('Page size')
    .pipe(
      z
        .number()
        .min(1, 'Page size must be between 1 and 100.')
        .max(100, 'Page size must be between 1 and 100.'),
    )
    .default(10),
});

export type AdminOrderQuery = z.output<typeof adminOrderQuerySchema>;

export const adminOrderParamsSchema = z.object({
  id: z.uuid({ error: 'Order id must be a valid UUID.' }),
});

// Only these user fields are ever selected, so the password hash cannot leak.
const customerSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phoneNumber: true,
} as const satisfies Prisma.UserSelect;

export const adminOrderListSelect = {
  id: true,
  order_total: true,
  order_status: true,
  createdAt: true,
  first_name: true,
  last_name: true,
  email: true,
  customer: { select: customerSelect },
  products: { select: { amount: true } },
} as const satisfies Prisma.orderSelect;

export const adminOrderDetailSelect = {
  id: true,
  order_total: true,
  order_status: true,
  createdAt: true,
  first_name: true,
  last_name: true,
  email: true,
  phone: true,
  address_line1: true,
  address_line2: true,
  town: true,
  postcode: true,
  delivery_option: true,
  delivery_price_pence: true,
  customer: { select: customerSelect },
  products: {
    select: {
      product_id: true,
      amount: true,
      unit_price_pence: true,
      product: { select: { name: true } },
    },
    orderBy: { product: { name: 'asc' } },
  },
} as const satisfies Prisma.orderSelect;

export type AdminOrderListRow = Prisma.orderGetPayload<{
  select: typeof adminOrderListSelect;
}>;
export type AdminOrderDetailRow = Prisma.orderGetPayload<{
  select: typeof adminOrderDetailSelect;
}>;

// The id tiebreaker keeps paging stable when createdAt or total are equal.
export const adminOrderOrderBy = {
  newest: [{ createdAt: 'desc' }, { id: 'desc' }],
  oldest: [{ createdAt: 'asc' }, { id: 'asc' }],
  totalDesc: [{ order_total: 'desc' }, { id: 'desc' }],
  totalAsc: [{ order_total: 'asc' }, { id: 'asc' }],
} as const satisfies Record<
  (typeof ORDER_SORTS)[number],
  Prisma.orderOrderByWithRelationInput[]
>;

// The UI shows the first 8 hex characters of the id, uppercased, without
// dashes. Dashes are re-inserted so the prefix matches the stored UUID.
function toIdPrefix(term: string): string | null {
  const hex = term.replace(/-/g, '');
  if (!/^[0-9a-f]{1,32}$/i.test(hex)) return null;
  const parts: string[] = [];
  let offset = 0;
  for (const length of [8, 4, 4, 4, 12]) {
    if (offset >= hex.length) break;
    parts.push(hex.slice(offset, offset + length));
    offset += length;
  }
  return parts.join('-');
}

function matchesWord(word: string): Prisma.orderWhereInput {
  const like = { contains: word, mode: 'insensitive' as const };
  return {
    OR: [
      { first_name: like },
      { last_name: like },
      { email: like },
      { customer: { firstName: like } },
      { customer: { lastName: like } },
      { customer: { email: like } },
    ],
  };
}

// Every search word must match a name or email, so "first last" works.
export function buildAdminOrderWhere({
  search,
  status,
}: Pick<AdminOrderQuery, 'search' | 'status'>): Prisma.orderWhereInput {
  const prefix = search ? toIdPrefix(search) : null;
  return {
    ...(status ? { order_status: status } : {}),
    ...(search
      ? {
          OR: [
            { AND: search.split(/\s+/).map(matchesWord) },
            ...(prefix
              ? [{ id: { startsWith: prefix, mode: 'insensitive' as const } }]
              : []),
          ],
        }
      : {}),
  };
}

interface NamedOrder {
  first_name: string | null;
  last_name: string | null;
  customer: { firstName: string; lastName: string };
}

function displayName(order: NamedOrder): string {
  if (order.first_name || order.last_name) {
    return `${order.first_name ?? ''} ${order.last_name ?? ''}`.trim();
  }
  return `${order.customer.firstName} ${order.customer.lastName}`.trim();
}

export function toAdminOrderSummary(order: AdminOrderListRow) {
  return {
    id: order.id,
    customerName: displayName(order),
    customerEmail: order.email ?? order.customer.email,
    status: order.order_status,
    totalPence: toPence(order.order_total),
    itemCount: order.products.reduce((sum, line) => sum + line.amount, 0),
    createdAt: order.createdAt.toISOString(),
  };
}

export function toAdminOrderDetail(order: AdminOrderDetailRow) {
  return {
    id: order.id,
    status: order.order_status,
    createdAt: order.createdAt.toISOString(),
    totalPence: toPence(order.order_total),
    customer: {
      id: order.customer.id,
      name: displayName(order),
      email: order.email ?? order.customer.email,
      phone: order.phone ?? order.customer.phoneNumber ?? null,
    },
    delivery: {
      option: order.delivery_option
        ? (findDeliveryOption(order.delivery_option)?.name ??
          order.delivery_option)
        : null,
      pricePence: order.delivery_price_pence,
      addressLine1: order.address_line1,
      addressLine2: order.address_line2,
      town: order.town,
      postcode: order.postcode,
    },
    items: order.products.map((line) => ({
      productId: line.product_id,
      name: line.product.name,
      quantity: line.amount,
      unitPricePence: line.unit_price_pence,
    })),
  };
}
