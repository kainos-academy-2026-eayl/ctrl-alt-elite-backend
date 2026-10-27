import { z } from 'zod';
import { customerResources } from '../resources/customer_resources';

export const defaultPageSize = customerResources.defaults.pageSize;
export const maxPageSize = customerResources.limits.maxPageSize;

const { limits, defaults, sortOptions, messages } = customerResources;

const optionalText = (message: string, max: number) =>
  z
    .string({ error: message })
    .trim()
    .max(max, message)
    .transform((value) => (value === '' ? undefined : value))
    .optional();

const wholeNumber = (message: string) =>
  z
    .string({ error: message })
    .regex(/^\d+$/, message)
    .transform(Number)
    .pipe(z.number().int().safe({ error: message }));

export const customerQuerySchema = z.object({
  search: optionalText(messages.search, limits.searchLength),
  email: optionalText(messages.queryEmail, limits.emailLength),
  sort: z.enum(sortOptions, { error: messages.sort }).default(defaults.sort),
  page: wholeNumber(messages.page)
    .pipe(z.number().min(1, messages.page))
    .default(defaults.page),
  pageSize: wholeNumber(messages.pageSize)
    .pipe(
      z.number().min(1, messages.pageSize).max(maxPageSize, messages.pageSize),
    )
    .default(defaultPageSize),
});

export const customerUpdateSchema = z.object(
  {
    firstName: z
      .string({ error: messages.firstNameRequired })
      .trim()
      .min(limits.requiredStringLength, messages.firstNameRequired)
      .max(limits.nameLength, messages.firstNameLength),
    lastName: z
      .string({ error: messages.lastNameLength })
      .trim()
      .max(limits.nameLength, messages.lastNameLength)
      .optional(),
    email: z
      .string({ error: messages.invalidEmail })
      .trim()
      .min(limits.requiredStringLength, messages.invalidEmail)
      .max(limits.emailLength, messages.invalidEmail)
      .email(messages.invalidEmail)
      .toLowerCase(),
  },
  { error: messages.detailsRequired },
);

export const customerPasswordResetSchema = z
  .object(
    {
      newPassword: z
        .string({ error: messages.passwordRequired })
        .min(limits.requiredStringLength, messages.passwordRequired),
      confirmPassword: z
        .string({ error: messages.passwordRequired })
        .min(limits.requiredStringLength, messages.passwordRequired),
    },
    { error: messages.passwordRequired },
  )
  .refine((change) => change.newPassword === change.confirmPassword, {
    message: messages.passwordMismatch,
    path: ['confirmPassword'],
  });

export type CustomerQuery = z.infer<typeof customerQuerySchema>;
export type CustomerSort = CustomerQuery['sort'];
export type CustomerUpdate = z.infer<typeof customerUpdateSchema>;
export type CustomerPasswordReset = z.infer<typeof customerPasswordResetSchema>;

export type CustomerRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Date;
};

export type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  registrationDate: string;
};
