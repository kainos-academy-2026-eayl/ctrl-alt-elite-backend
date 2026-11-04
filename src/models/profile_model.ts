import { z } from 'zod';
import { ValidationError } from '../errors/appErrors';

export const MAX_PROFILE_PHOTO_BYTES = 20 * 1024 * 1024;
export const PROFILE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const name = z
  .string()
  .trim()
  .min(1, 'Name cannot be empty.')
  .max(100, 'Names must be 100 characters or fewer.');

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
