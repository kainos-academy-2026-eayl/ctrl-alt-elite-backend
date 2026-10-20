import { hash } from 'argon2'
import type { PrismaClient } from './generated/prisma/client'

export type Registration = {
  firstName: string
  lastName: string
  email: string
  password: string
  confirmPassword: string
}

export function validateRegistration(body: unknown): Registration {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new RegistrationValidationError('Registration details must be a JSON object.')
  }

  const fields: Record<string, unknown> = Object.fromEntries(Object.entries(body))
  const { firstName, lastName, email, password, confirmPassword } = fields

  if (typeof firstName !== 'string' || !firstName.trim() || firstName.trim().length > 100 ||
      typeof lastName !== 'string' || !lastName.trim() || lastName.trim().length > 100) {
    throw new RegistrationValidationError('First and last names are required and must be at most 100 characters.')
  }
  if (typeof email !== 'string' || email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new RegistrationValidationError('Please enter a valid email address.')
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128 ||
      !/\d/.test(password) || !/[@\u00a3$%&]/.test(password)) {
    throw new RegistrationValidationError('Use 8 to 128 characters, including a digit and one of: @, \u00a3, $, %, &.')
  }
  if (typeof confirmPassword !== 'string' || password !== confirmPassword) {
    throw new RegistrationValidationError('Passwords do not match.')
  }

  return {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim().toLowerCase(),
    password,
    confirmPassword,
  }
}

export class RegistrationValidationError extends Error {}

export async function registerUser(database: PrismaClient, registration: Registration) {
  const passwordHash = await hash(registration.password)
  return database.user.create({
    data: {
      firstName: registration.firstName,
      lastName: registration.lastName,
      email: registration.email,
      passwordHash,
    },
    select: { id: true, firstName: true, lastName: true, email: true, createdAt: true },
  })
}
