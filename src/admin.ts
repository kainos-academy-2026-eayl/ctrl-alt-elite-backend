import { hash, verify } from 'argon2';
import { z } from 'zod';
import type { PrismaClient } from './generated/prisma/client';
import { passwordMessage, passwordSchema } from './registration';

const requiredPasswordMessage = 'All password fields are required.';
const nameRequiredMessage = 'Name is required.';
const nameLengthMessage = 'Name must be 100 characters or fewer.';
const emailRequiredMessage = 'Email address is required.';
const emailInvalidMessage = 'Enter a valid email address.';

export const profileUpdateSchema = z.object(
  {
    name: z
      .string({ error: nameRequiredMessage })
      .trim()
      .min(1, nameRequiredMessage)
      .max(100, nameLengthMessage),
    email: z
      .string({ error: emailRequiredMessage })
      .trim()
      .min(1, emailRequiredMessage)
      .max(254, emailInvalidMessage)
      .email(emailInvalidMessage)
      .toLowerCase(),
  },
  { error: 'Profile details are required.' },
);

export const changePasswordSchema = z
  .object(
    {
      currentPassword: z
        .string({ error: requiredPasswordMessage })
        .min(1, requiredPasswordMessage)
        .max(128, requiredPasswordMessage),
      newPassword: z
        .string({ error: requiredPasswordMessage })
        .min(1, requiredPasswordMessage)
        .max(128, requiredPasswordMessage),
      confirmPassword: z
        .string({ error: requiredPasswordMessage })
        .min(1, requiredPasswordMessage)
        .max(128, requiredPasswordMessage),
    },
    { error: requiredPasswordMessage },
  )
  .refine((change) => change.newPassword === change.confirmPassword, {
    message: 'The new password and confirmation do not match.',
    path: ['confirmPassword'],
  });

export type PasswordChange = z.infer<typeof changePasswordSchema>;
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export class AdminValidationError extends Error {}
export class IncorrectPasswordError extends Error {
  constructor() {
    super('Current password is incorrect.');
  }
}
export class SamePasswordError extends Error {
  constructor() {
    super('New password must be different from your current password.');
  }
}
export class EmailAlreadyInUseError extends Error {
  constructor() {
    super('Email is already in use.');
  }
}
export class AdminNotFoundError extends Error {
  constructor() {
    super('Administrator not found.');
  }
}

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
