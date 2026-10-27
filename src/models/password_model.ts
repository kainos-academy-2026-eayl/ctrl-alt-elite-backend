import { z } from 'zod';

export const passwordMessage =
  'Use 8 to 128 characters, including a digit and one of: @, \u00a3, $, %, &.';

export const passwordSchema = z
  .string({ error: passwordMessage })
  .min(8, passwordMessage)
  .max(128, passwordMessage)
  .regex(/\d/, passwordMessage)
  .regex(/[@\u00a3$%&]/, passwordMessage);
