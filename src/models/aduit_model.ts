import type { Prisma } from '../generated/prisma/client';

export const auditSelect = {
  id: true,
  description: true,
  createdAt: true,
  adminId: true,
} as const satisfies Prisma.auditSelect;

export type audit = Prisma.auditGetPayload<{
  select: typeof auditSelect;
}>;

export type AuditDatabase = {
  audit: {
    findMany(args: {
      orderBy: { createdAt: 'asc' };
      select: typeof auditSelect;
    }): PromiseLike<audit[]>;
    findUnique(args: {
      where: { id: string };
      select: typeof auditSelect;
    }): PromiseLike<audit | null>;
  };
};