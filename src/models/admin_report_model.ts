import { z } from 'zod';

const DAY_MS = 86_400_000;
const MAX_DAYS = 366;
const dateMessage = 'Dates must be real calendar dates in YYYY-MM-DD format.';

const toMs = (value: string) => Date.parse(`${value}T00:00:00.000Z`);

// Date.parse rolls 2026-02-30 over to March, so round-trip to catch it.
const isRealDate = (value: string) => {
  const ms = toMs(value);
  return !Number.isNaN(ms) && new Date(ms).toISOString().startsWith(value);
};

const isoDate = z
  .string({ error: dateMessage })
  .regex(/^\d{4}-\d{2}-\d{2}$/, dateMessage)
  .refine(isRealDate, dateMessage);

export const salesReportQuerySchema = z
  .object({ from: isoDate, to: isoDate })
  .superRefine((query, ctx) => {
    if (!isRealDate(query.from) || !isRealDate(query.to)) return;
    const days = (toMs(query.to) - toMs(query.from)) / DAY_MS;
    if (days < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['from'],
        message: '"from" must not be after "to".',
      });
    } else if (days + 1 > MAX_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: `The date range must not exceed ${MAX_DAYS} days.`,
      });
    }
  })
  .transform(({ from, to }) => ({
    from,
    to,
    start: new Date(toMs(from)),
    // Exclusive bound at the start of the next day includes all of `to` (UTC).
    endExclusive: new Date(toMs(to) + DAY_MS),
  }));

export type SalesReportQuery = z.output<typeof salesReportQuerySchema>;
