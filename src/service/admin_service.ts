import { hash, verify } from 'argon2';
import {
  AdminNotFoundError,
  AdminValidationError,
  EmailAlreadyInUseError,
  IncorrectPasswordError,
  SamePasswordError,
} from '../errors/admin_errors';
import type { PrismaClient } from '../generated/prisma/client';
import {
  changePasswordSchema,
  type PasswordChange,
  type ProfileUpdate,
  profileUpdateSchema,
} from '../models/admin_model';
import { passwordMessage, passwordSchema } from '../models/password_model';

export function validateProfileUpdate(body: unknown): ProfileUpdate {
  const result = profileUpdateSchema.safeParse(body);
  if (!result.success) {
    throw new AdminValidationError(
      result.error.issues[0]?.message ?? 'Invalid profile details.',
    );
  }
  return result.data;
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

export async function updateAdminProfile(
  database: PrismaClient,
  userId: string,
  profile: ProfileUpdate,
) {
  const duplicate = await database.user.findFirst({
    where: {
      id: { not: userId },
      email: { equals: profile.email, mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (duplicate) throw new EmailAlreadyInUseError();

  const firstSpace = profile.name.indexOf(' ');
  const firstName =
    firstSpace === -1 ? profile.name : profile.name.slice(0, firstSpace);
  const lastName = firstSpace === -1 ? '' : profile.name.slice(firstSpace + 1);
  const user = await database.user.update({
    where: { id: userId },
    data: { firstName, lastName, email: profile.email },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
    },
  });
  return {
    id: user.id,
    name: `${user.firstName} ${user.lastName}`.trim(),
    email: user.email,
    role: user.role,
  };
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
  if (change.newPassword === change.currentPassword) {
    throw new SamePasswordError();
  }
  const passwordResult = passwordSchema.safeParse(change.newPassword);
  if (!passwordResult.success) {
    throw new AdminValidationError(
      passwordResult.error.issues[0]?.message ?? passwordMessage,
    );
  }
  await database.user.update({
    where: { id: userId },
    data: { passwordHash: await hash(change.newPassword) },
  });
}
