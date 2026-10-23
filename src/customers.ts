import { z } from 'zod';
import type { PrismaClient } from './generated/prisma/client';

export const defaultPageSize = 10;
export const maxPageSize = 100;

const sortOptions = ['nameAsc', 'nameDesc', 'newest', 'oldest'] as const;
const searchMessage = 'search must be a string of at most 200 characters.';
const emailMessage = 'email must be a string of at most 254 characters.';
const pageMessage = 'page must be a positive whole number.';
const pageSizeMessage = `pageSize must be a whole number between 1 and ${maxPageSize}.`;
const sortMessage = `sort must be one of: ${sortOptions.join(', ')}.`;

const optionalText = (message: string, max: number) =>
  z
    .string({ error: message })
    .trim()
    .max(max, message)
    .transform((value) => (value === '' ? undefined : value))
    .optional();

const wholeNumber = (message: string) =>
  z
    .string({ error: message })
    .regex(/^\d+$/, message)
    .transform(Number)
    .pipe(z.number().int().safe({ error: message }));

export const customerQuerySchema = z.object({
  search: optionalText(searchMessage, 200),
  email: optionalText(emailMessage, 254),
  sort: z.enum(sortOptions, { error: sortMessage }).default('newest'),
  page: wholeNumber(pageMessage)
    .pipe(z.number().min(1, pageMessage))
    .default(1),
  pageSize: wholeNumber(pageSizeMessage)
    .pipe(z.number().min(1, pageSizeMessage).max(maxPageSize, pageSizeMessage))
    .default(defaultPageSize),
});

export type CustomerQuery = z.infer<typeof customerQuerySchema>;
export type CustomerSort = CustomerQuery['sort'];

export class CustomerValidationError extends Error {}
export class CustomerNotFoundError extends Error {
  constructor() {
    super('Customer not found.');
  }
}

export function validateCustomerQuery(query: unknown): CustomerQuery {
  const result = customerQuerySchema.safeParse(query);
  if (!result.success) {
    throw new CustomerValidationError(
      result.error.issues[0]?.message ?? 'Invalid customer query.',
    );
  }

  return result.data;
}

const customerSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  createdAt: true,
} as const;

type CustomerRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Date;
};

export type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  registrationDate: string;
};

export function toCustomer(record: CustomerRecord): Customer {
  return {
    id: record.id,
    firstName: record.firstName,
    lastName: record.lastName,
    email: record.email,
    registrationDate: record.createdAt.toISOString().slice(0, 10),
  };
}

const orderBy = {
  nameAsc: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
  nameDesc: [{ firstName: 'desc' }, { lastName: 'desc' }, { id: 'desc' }],
  newest: [{ createdAt: 'desc' }, { id: 'desc' }],
  oldest: [{ createdAt: 'asc' }, { id: 'asc' }],
} as const;

// Every search word must appear in the first or last name.
function buildWhere({ search, email }: CustomerQuery) {
  const words = search?.split(/\s+/) ?? [];
  return {
    AND: [
      ...words.map((word) => ({
        OR: [
          { firstName: { contains: word, mode: 'insensitive' as const } },
          { lastName: { contains: word, mode: 'insensitive' as const } },
        ],
      })),
      ...(email
        ? [{ email: { contains: email, mode: 'insensitive' as const } }]
        : []),
    ],
  };
}

export async function listCustomers(
  database: PrismaClient,
  query: CustomerQuery,
) {
  const where = buildWhere(query);
  const [records, total] = await Promise.all([
    database.user.findMany({
      where,
      orderBy: [...orderBy[query.sort]],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: customerSelect,
    }),
    database.user.count({ where }),
  ]);

  return {
    customers: records.map(toCustomer),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
}

export async function getCustomer(database: PrismaClient, id: string) {
  const record = await database.user.findUnique({
    where: { id },
    select: customerSelect,
  });
  if (!record) {
    throw new CustomerNotFoundError();
  }

  return toCustomer(record);
}
