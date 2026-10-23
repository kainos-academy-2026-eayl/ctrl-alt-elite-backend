import { hash } from 'argon2';
import { z } from 'zod';
import { Prisma, type PrismaClient } from './generated/prisma/client';
import { passwordMessage, passwordSchema } from './registration';

export const defaultPageSize = 10;
export const maxPageSize = 100;

const sortOptions = ['nameAsc', 'nameDesc', 'newest', 'oldest'] as const;
const searchMessage = 'search must be a string of at most 200 characters.';
const emailMessage = 'email must be a string of at most 254 characters.';
const pageMessage = 'page must be a positive whole number.';
const pageSizeMessage = `pageSize must be a whole number between 1 and ${maxPageSize}.`;
const sortMessage = `sort must be one of: ${sortOptions.join(', ')}.`;
const firstNameMessage = 'First name is required.';
const lastNameMessage = 'Last name must be 100 characters or fewer.';
const updateEmailMessage = 'Enter a valid email address.';
const customerPasswordMessage = 'New password and confirmation are required.';

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
export class CustomerEmailInUseError extends Error {
  constructor() {
    super('Email is already in use.');
  }
}

function throwIfCustomerWasDeleted(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  ) {
    throw new CustomerNotFoundError();
  }
  throw error;
}

export const customerUpdateSchema = z.object(
  {
    firstName: z
      .string({ error: firstNameMessage })
      .trim()
      .min(1, firstNameMessage)
      .max(100, 'First name must be 100 characters or fewer.'),
    lastName: z
      .string({ error: lastNameMessage })
      .trim()
      .max(100, lastNameMessage)
      .optional(),
    email: z
      .string({ error: updateEmailMessage })
      .trim()
      .min(1, updateEmailMessage)
      .max(254, updateEmailMessage)
      .email(updateEmailMessage)
      .toLowerCase(),
  },
  { error: 'Customer details are required.' },
);

export const customerPasswordResetSchema = z
  .object(
    {
      newPassword: z
        .string({ error: customerPasswordMessage })
        .min(1, customerPasswordMessage),
      confirmPassword: z
        .string({ error: customerPasswordMessage })
        .min(1, customerPasswordMessage),
    },
    { error: customerPasswordMessage },
  )
  .refine((change) => change.newPassword === change.confirmPassword, {
    message: 'The new password and confirmation do not match.',
    path: ['confirmPassword'],
  });

export type CustomerUpdate = z.infer<typeof customerUpdateSchema>;
export type CustomerPasswordReset = z.infer<typeof customerPasswordResetSchema>;

export function validateCustomerQuery(query: unknown): CustomerQuery {
  const result = customerQuerySchema.safeParse(query);
  if (!result.success) {
    throw new CustomerValidationError(
      result.error.issues[0]?.message ?? 'Invalid customer query.',
    );
  }
  return result.data;
}

export function validateCustomerUpdate(body: unknown): CustomerUpdate {
  const result = customerUpdateSchema.safeParse(body);
  if (!result.success) {
    throw new CustomerValidationError(
      result.error.issues[0]?.message ?? 'Invalid customer details.',
    );
  }
  return result.data;
}

export function validateCustomerPasswordReset(
  body: unknown,
): CustomerPasswordReset {
  const result = customerPasswordResetSchema.safeParse(body);
  if (!result.success) {
    throw new CustomerValidationError(
      result.error.issues[0]?.message ?? 'Invalid password details.',
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

export async function updateCustomer(
  database: PrismaClient,
  id: string,
  customer: CustomerUpdate,
) {
  const existing = await database.user.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new CustomerNotFoundError();

  const duplicate = await database.user.findFirst({
    where: {
      id: { not: id },
      email: { equals: customer.email, mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (duplicate) throw new CustomerEmailInUseError();

  let record: CustomerRecord;
  try {
    record = await database.user.update({
      where: { id },
      data: {
        firstName: customer.firstName,
        ...(customer.lastName !== undefined
          ? { lastName: customer.lastName }
          : {}),
        email: customer.email,
      },
      select: customerSelect,
    });
  } catch (error) {
    throwIfCustomerWasDeleted(error);
  }
  return toCustomer(record);
}

export async function resetCustomerPassword(
  database: PrismaClient,
  id: string,
  change: CustomerPasswordReset,
) {
  const existing = await database.user.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new CustomerNotFoundError();

  const passwordResult = passwordSchema.safeParse(change.newPassword);
  if (!passwordResult.success) {
    throw new CustomerValidationError(
      passwordResult.error.issues[0]?.message ?? passwordMessage,
    );
  }
  try {
    await database.user.update({
      where: { id },
      data: { passwordHash: await hash(change.newPassword) },
    });
  } catch (error) {
    throwIfCustomerWasDeleted(error);
  }
}
