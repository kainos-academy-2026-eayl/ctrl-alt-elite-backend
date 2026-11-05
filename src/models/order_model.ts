import { z } from 'zod';
import type { Prisma, PrismaClient } from '../generated/prisma/client';

/** Prices are fixed here so the frontend can never choose its own. */
export const DELIVERY_OPTIONS = [
  {
    id: 'standard',
    kind: 'delivery',
    name: 'Standard delivery',
    description: '3–5 working days',
    pricePence: 0,
  },
  {
    id: 'express',
    kind: 'delivery',
    name: 'Express delivery',
    description: '1–2 working days',
    pricePence: 499,
  },
  {
    id: 'collection-1',
    kind: 'collection',
    name: 'Collection point',
    description: '0.5 miles away',
    pricePence: 0,
  },
  {
    id: 'collection-2',
    kind: 'collection',
    name: 'Collection point',
    description: '1.2 miles away',
    pricePence: 0,
  },
  {
    id: 'collection-3',
    kind: 'collection',
    name: 'Collection point',
    description: '2.4 miles away',
    pricePence: 0,
  },
] as const;

export type DeliveryOption = (typeof DELIVERY_OPTIONS)[number];
export type DeliveryOptionId = DeliveryOption['id'];

const deliveryOptionIds = DELIVERY_OPTIONS.map((option) => option.id) as [
  DeliveryOptionId,
  ...DeliveryOptionId[],
];

export function findDeliveryOption(id: string): DeliveryOption | undefined {
  return DELIVERY_OPTIONS.find((option) => option.id === id);
}

const UK_POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/;
const PHONE_CHARACTERS = /^[\d\s+().-]+$/;
// UK numbers in national form: 01 has 9 or 10 digits after the 0, 08 has 9
// or 10, and 02, 03, 07 and 09 have 10.
const UK_PHONE = /^0(?:1\d{8,9}|[2379]\d{9}|8\d{8,9})$/;
const PHONE_MESSAGE = 'Enter a valid UK phone number.';

/** "+44 (0)7700 900-123" becomes "07700900123". */
function toNationalPhone(phone: string): string {
  return phone
    .replace(/^\s*\+44\s*\(0\)/, '+44')
    .replace(/[\s().-]/g, '')
    .replace(/^(?:\+44|0044)/, '0');
}

function requiredText(label: string, max: number) {
  const message = `${label} is required and must be at most ${max} characters.`;
  return z.string({ error: message }).trim().min(1, message).max(max, message);
}

const orderItemSchema = z.strictObject({
  productId: z.string().uuid(),
  quantity: z.number().int().positive().safe(),
});

const customerSchema = z.strictObject({
  firstName: requiredText('First name', 100),
  lastName: requiredText('Last name', 100),
  email: z
    .string({ error: 'Enter a valid email address.' })
    .trim()
    .max(254, 'Enter a valid email address.')
    .pipe(z.email({ error: 'Enter a valid email address.' })),
  phone: z
    .string({ error: PHONE_MESSAGE })
    .max(20, PHONE_MESSAGE)
    .regex(PHONE_CHARACTERS, PHONE_MESSAGE)
    .transform(toNationalPhone)
    .pipe(z.string().regex(UK_PHONE, PHONE_MESSAGE)),
});

const addressSchema = z.strictObject({
  line1: requiredText('Address line 1', 100),
  line2: z
    .string()
    .trim()
    .max(100, 'Address line 2 must be at most 100 characters.')
    .optional()
    .transform((line2) => line2 || undefined),
  town: requiredText('Town or city', 60),
  postcode: z
    .string({ error: 'Enter a valid UK postcode.' })
    .transform((postcode) => postcode.trim().toUpperCase())
    .pipe(z.string().regex(UK_POSTCODE, 'Enter a valid UK postcode.'))
    .transform((postcode) => postcode.replace(UK_POSTCODE, '$1 $2')),
});

export const orderSchema = z
  .strictObject({
    items: z.array(orderItemSchema).nonempty(),
    customer: customerSchema,
    address: addressSchema,
    deliveryOption: z.enum(deliveryOptionIds, {
      error: 'Choose a delivery option.',
    }),
  })
  .refine(
    (data) => {
      const productIds = data.items.map((item) => item.productId);
      return new Set(productIds).size === productIds.length;
    },
    { message: 'Each product may appear only once.' },
  );

export const OrderParamsSchema = z.object({
  orderId: z.uuid({ error: 'Order id must be a valid UUID.' }),
});

export const orderSelect = {
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

export const accountSelect = {
  firstName: true,
  lastName: true,
  email: true,
  creditBalancePence: true,
} as const satisfies Prisma.UserSelect;

export type CreateOrderInput = z.infer<typeof orderSchema>;

export type Order = Prisma.orderGetPayload<{
  select: typeof orderSelect;
}>;

export type Account = Prisma.UserGetPayload<{ select: typeof accountSelect }>;

export type OrderDatabase = Pick<
  PrismaClient,
  '$transaction' | 'order' | 'user'
>;

export interface OrderItemResponseDto {
  productId: string;
  name: string;
  unitPricePence: number;
  quantity: number;
  lineTotalPence: number;
}

export interface OrderResponseDto {
  id: string;
  status: string;
  createdAt: string;
  items: OrderItemResponseDto[];
  itemsTotalPence: number;
  deliveryPricePence: number;
  totalPence: number;
  delivery: { id: string; name: string; description: string } | null;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  address: {
    line1: string;
    line2: string | null;
    town: string;
    postcode: string;
  };
}

// Prices are stored in pounds; rounding avoids float drift like 0.29 * 100.
export function toPence(pounds: number): number {
  return Math.round(pounds * 100);
}

export function toOrderResponse(order: Order): OrderResponseDto {
  const items = order.products.map((line) => ({
    productId: line.product_id,
    name: line.product.name,
    unitPricePence: line.unit_price_pence,
    quantity: line.amount,
    lineTotalPence: line.unit_price_pence * line.amount,
  }));
  const delivery = order.delivery_option
    ? findDeliveryOption(order.delivery_option)
    : undefined;
  return {
    id: order.id,
    status: order.order_status,
    createdAt: order.createdAt.toISOString(),
    items,
    itemsTotalPence: items.reduce((sum, item) => sum + item.lineTotalPence, 0),
    deliveryPricePence: order.delivery_price_pence,
    totalPence: toPence(order.order_total),
    delivery: delivery
      ? {
          id: delivery.id,
          name: delivery.name,
          description: delivery.description,
        }
      : null,
    customer: {
      firstName: order.first_name ?? '',
      lastName: order.last_name ?? '',
      email: order.email ?? '',
      phone: order.phone ?? '',
    },
    address: {
      line1: order.address_line1 ?? '',
      line2: order.address_line2,
      town: order.town ?? '',
      postcode: order.postcode ?? '',
    },
  };
}
