import { hash } from 'argon2';
import { z } from 'zod';
import type { PrismaClient } from './generated/prisma/client';

const nameMessage =
  'First and last names are required and must be at most 100 characters.';
const emailMessage = 'Please enter a valid email address.';
export const passwordMessage =
  'Use 8 to 128 characters, including a digit and one of: @, \u00a3, $, %, &.';
const confirmationMessage = 'Passwords do not match.';
const nameSchema = z
  .string({ error: nameMessage })
  .trim()
  .min(1, nameMessage)
  .max(100, nameMessage);

export const passwordSchema = z
  .string({ error: passwordMessage })
  .min(8, passwordMessage)
  .max(128, passwordMessage)
  .regex(/\d/, passwordMessage)
  .regex(/[@\u00a3$%&]/, passwordMessage);

export const registrationSchema = z
  .object(
    {
      firstName: nameSchema,
      lastName: nameSchema,
      email: z
        .string({ error: emailMessage })
        .trim()
        .max(254, emailMessage)
        .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, emailMessage)
        .toLowerCase(),
      password: passwordSchema,
      confirmPassword: z.string({ error: confirmationMessage }),
    },
    {
      error:
        'Invalid details - check firstName, lastName, email or password provided.',
    },
  )
  .refine(
    (registration) => registration.password === registration.confirmPassword,
    { message: confirmationMessage, path: ['confirmPassword'] },
  );

export type Registration = z.infer<typeof registrationSchema>;

export function validateRegistration(body: unknown): Registration {
  const result = registrationSchema.safeParse(body);
  if (!result.success) {
    throw new RegistrationValidationError(
      result.error.issues[0]?.message ?? 'Invalid registration details.',
    );
  }

  return result.data;
}

export class RegistrationValidationError extends Error {}

export async function registerUser(
  database: PrismaClient,
  registration: Registration,
) {
  const passwordHash = await hash(registration.password);
  return database.user.create({
    data: {
      firstName: registration.firstName,
      lastName: registration.lastName,
      email: registration.email,
      passwordHash,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      createdAt: true,
    },
  });
}
