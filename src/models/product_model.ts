import { z } from 'zod';
import { parseImageDataUrl } from './product_image';

const maxMoney = 1_000_000;

const image = z
  .string({ error: 'Image must be a base64 data URL.' })
  .transform((value, context) => {
    const result = parseImageDataUrl(value);
    if (!result.ok) {
      context.issues.push({
        code: 'custom',
        message: result.message,
        input: value,
      });
      return z.NEVER;
    }
    return Uint8Array.from(result.bytes);
  });

const productFields = {
  name: z
    .string({ error: 'Name is required.' })
    .trim()
    .min(1, 'Name is required.')
    .max(120, 'Name must be 120 characters or fewer.'),
  category: z
    .string({ error: 'Category is required.' })
    .trim()
    .min(1, 'Category is required.')
    .max(60, 'Category must be 60 characters or fewer.'),
  description: z
    .string({ error: 'Description must be text.' })
    .trim()
    .max(2000, 'Description must be 2000 characters or fewer.')
    .default(''),
  price: z
    .number({ error: 'Price must be a number.' })
    .min(0, 'Price must be between 0 and 1,000,000.')
    .max(maxMoney, 'Price must be between 0 and 1,000,000.')
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
      'Price must have at most 2 decimal places.',
    ),
  stock: z
    .number({ error: 'Stock must be a number.' })
    .int('Stock must be a whole number.')
    .min(0, 'Stock must be between 0 and 1,000,000.')
    .max(maxMoney, 'Stock must be between 0 and 1,000,000.'),
};

const bodyError = { error: 'Request body must be a JSON object.' };

export const productCreateSchema = z.object(
  {
    ...productFields,
    image,
  },
  bodyError,
);

export const productUpdateSchema = z.object(
  { ...productFields, image: image.optional() },
  bodyError,
);

export type ProductCreate = z.output<typeof productCreateSchema>;
export type ProductUpdate = z.output<typeof productUpdateSchema>;

export const orderedProductMessage =
  'This product has been ordered and cannot be deleted. Set its stock to 0 instead.';
