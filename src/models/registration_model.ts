import { z } from 'zod';
import { passwordSchema } from './password_model';

const nameMessage =
  'First and last names are required and must be at most 100 characters.';
const emailMessage = 'Please enter a valid email address.';
const confirmationMessage = 'Passwords do not match.';
const nameSchema = z
  .string({ error: nameMessage })
  .trim()
  .min(1, nameMessage)
  .max(100, nameMessage);

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
