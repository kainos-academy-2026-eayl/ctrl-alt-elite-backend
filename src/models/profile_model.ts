import { z } from 'zod';
import { ValidationError } from '../errors/appErrors';

export const MAX_PROFILE_PHOTO_BYTES = 20 * 1024 * 1024;
export const PROFILE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const name = z
  .string()
  .trim()
  .min(1, 'Name cannot be empty.')
  .max(100, 'Names must be 100 characters or fewer.');

function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .nullable()
    .transform((value) => value || null)
    .optional();
}

const profileUpdateSchema = z
  .object({
    username: z
      .string()
      .trim()
      .max(30, 'Username must be 30 characters or fewer.')
      .nullable()
      .transform((value) => value || null)
      .optional(),
    firstName: name.optional(),
    lastName: name.optional(),
    addressLine1: optionalText(200, 'Address line 1'),
    addressLine2: optionalText(200, 'Address line 2'),
    postcode: optionalText(20, 'Postcode'),
    phoneNumber: optionalText(30, 'Phone number').refine(
      (value) => !value || (/^\+?[\d ().-]+$/.test(value) && /\d/.test(value)),
      {
        message:
          'Enter a valid phone number using digits, spaces, +, brackets, dots or hyphens.',
      },
    ),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one profile field to update.',
  });

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export function validateOwnProfileUpdate(body: unknown): ProfileUpdate {
  const result = profileUpdateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data;
}
