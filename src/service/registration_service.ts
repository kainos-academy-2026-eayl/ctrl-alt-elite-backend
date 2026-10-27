import { hash } from 'argon2';
import { RegistrationValidationError } from '../errors/registration_errors';
import type { PrismaClient } from '../generated/prisma/client';
import {
  type Registration,
  registrationSchema,
} from '../models/registration_model';

export function validateRegistration(body: unknown): Registration {
  const result = registrationSchema.safeParse(body);
  if (!result.success) {
    throw new RegistrationValidationError(
      result.error.issues[0]?.message ?? 'Invalid registration details.',
    );
  }

  return result.data;
}

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
