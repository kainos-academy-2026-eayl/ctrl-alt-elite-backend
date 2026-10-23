import { verify } from 'argon2';
import type { PrismaClient } from './generated/prisma/client';

export const supportedRoles = ['CUSTOMER', 'ADMIN'] as const;
export type UserRole = (typeof supportedRoles)[number];

export class RoleNotDeterminedError extends Error {}

function isSupportedRole(role: unknown): role is UserRole {
  return supportedRoles.some((supported) => supported === role);
}

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

  if (!isSupportedRole(user.role)) throw new RoleNotDeterminedError();

  return { userId: user.id, email: user.email, role: user.role };
}
