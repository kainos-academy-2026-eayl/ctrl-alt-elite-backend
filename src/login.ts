import { hash, verify } from 'argon2';
import { z } from 'zod';
import type { PrismaClient } from './generated/prisma/client';

const loginMessage = 'Please enter your email address and password.';
const invalidCredentialsMessage = 'Invalid email or password.';

export const loginSchema = z.object(
  {
    email: z
      .string({ error: loginMessage })
      .trim()
      .min(1, loginMessage)
      .max(254, loginMessage)
      .toLowerCase(),
    password: z
      .string({ error: loginMessage })
      .min(1, loginMessage)
      .max(128, loginMessage),
  },
  { error: loginMessage },
);

export type Login = z.infer<typeof loginSchema>;

export class LoginValidationError extends Error {}

export class InvalidCredentialsError extends Error {
  constructor() {
    super(invalidCredentialsMessage);
  }
}

export function validateLogin(body: unknown): Login {
  const result = loginSchema.safeParse(body);
  if (!result.success) {
    throw new LoginValidationError(
      result.error.issues[0]?.message ?? loginMessage,
    );
  }

  return result.data;
}

// Verified when the email is unknown so response time doesn't reveal which emails exist.
const dummyHash = hash('not-a-real-password');

export async function authenticateUser(database: PrismaClient, login: Login) {
  const user = await database.user.findUnique({
    where: { email: login.email },
  });
  const passwordHash = user?.passwordHash ?? (await dummyHash);
  const passwordMatches = await verify(passwordHash, login.password);

  if (!user || !passwordMatches) {
    throw new InvalidCredentialsError();
  }

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
  };
}
