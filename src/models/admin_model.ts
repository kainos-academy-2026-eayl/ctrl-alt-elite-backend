import { z } from 'zod';

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
