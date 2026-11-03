import type { AuditDatabase, audit } from '../models/aduit_model';
import { auditSelect } from '../models/aduit_model';

export function createAuditRepository(database: AuditDatabase) {
  return {
    async findAll(): Promise<audit[]> {
      return database.audit.findMany({
        orderBy: { createdAt: 'asc' },
        select: auditSelect,
      });
    },
    async findById(id: string): Promise<audit | null> {
      return database.audit.findUnique({
        where: { id },
        select: auditSelect,
      });
    },
  };
}

export type AuditRepository = ReturnType<typeof createAuditRepository>;
