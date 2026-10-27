import { hash } from 'argon2';
import {
  CustomerEmailInUseError,
  CustomerNotFoundError,
  CustomerValidationError,
} from '../errors/customer_errors';
import { Prisma, type PrismaClient } from '../generated/prisma/client';
import {
  type Customer,
  type CustomerPasswordReset,
  type CustomerQuery,
  type CustomerRecord,
  type CustomerUpdate,
  customerPasswordResetSchema,
  customerQuerySchema,
  customerUpdateSchema,
} from '../models/customer_model';
import { passwordMessage, passwordSchema } from '../models/password_model';
import { customerResources } from '../resources/customer_resources';

const { messages } = customerResources;

function throwIfCustomerWasDeleted(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  ) {
    throw new CustomerNotFoundError();
  }
  throw error;
}

export function validateCustomerQuery(query: unknown): CustomerQuery {
  const result = customerQuerySchema.safeParse(query);
  if (!result.success) {
    throw new CustomerValidationError(
      result.error.issues[0]?.message ?? messages.invalidQuery,
    );
  }
  return result.data;
}

export function validateCustomerUpdate(body: unknown): CustomerUpdate {
  const result = customerUpdateSchema.safeParse(body);
  if (!result.success) {
    throw new CustomerValidationError(
      result.error.issues[0]?.message ?? messages.invalidDetails,
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
      result.error.issues[0]?.message ?? messages.invalidPassword,
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
