import { hash, verify } from 'argon2';
import { z } from 'zod';
import type { PrismaClient } from './generated/prisma/client';

const passwordMessage =
  'Use 8 to 128 characters, including a digit and one of: @, \u00a3, $, %, &.';
const confirmationMessage = 'Passwords do not match.';
const currentPasswordMessage = 'Current password is required.';

export const changePasswordSchema = z
  .object(
    {
      currentPassword: z
        .string({ error: currentPasswordMessage })
        .min(1, currentPasswordMessage)
        .max(128, currentPasswordMessage),
      newPassword: z
        .string({ error: passwordMessage })
        .min(8, passwordMessage)
        .max(128, passwordMessage)
        .regex(/\d/, passwordMessage)
        .regex(/[@\u00a3$%&]/, passwordMessage),
      confirmPassword: z.string({ error: confirmationMessage }),
    },
    { error: 'Invalid details - check the passwords provided.' },
  )
  .refine((change) => change.newPassword === change.confirmPassword, {
    message: confirmationMessage,
    path: ['confirmPassword'],
  });

export type PasswordChange = z.infer<typeof changePasswordSchema>;

export class AdminValidationError extends Error {}
export class IncorrectPasswordError extends Error {
  constructor() {
    super('Current password is incorrect.');
  }
}
export class AdminNotFoundError extends Error {
  constructor() {
    super('Administrator not found.');
  }
}

export function validatePasswordChange(body: unknown): PasswordChange {
  const result = changePasswordSchema.safeParse(body);
  if (!result.success) {
    throw new AdminValidationError(
      result.error.issues[0]?.message ?? 'Invalid password details.',
    );
  }
  return result.data;
}

export async function getAdminProfile(database: PrismaClient, userId: string) {
  const user = await database.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
    },
  });
  if (!user) throw new AdminNotFoundError();
  return {
    id: user.id,
    name: `${user.firstName} ${user.lastName}`,
    email: user.email,
    role: user.role,
  };
}

export async function changeAdminPassword(
  database: PrismaClient,
  userId: string,
  change: PasswordChange,
) {
  const user = await database.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) throw new AdminNotFoundError();
  if (!(await verify(user.passwordHash, change.currentPassword))) {
    throw new IncorrectPasswordError();
  }
  await database.user.update({
    where: { id: userId },
    data: { passwordHash: await hash(change.newPassword) },
  });
}
