import { verify } from 'argon2';
import type { PrismaClient } from './generated/prisma/client';

export async function authenticateUser(
  database: PrismaClient,
  credentials: unknown,
) {
  if (typeof credentials !== 'object' || credentials === null) return null;
  const { email, password } = credentials as Record<string, unknown>;
  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    email.length > 254 ||
    password.length > 128
  ) {
    return null;
  }

  const user = await database.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user || !(await verify(user.passwordHash, password))) return null;

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    createdAt: user.createdAt,
  };
}
