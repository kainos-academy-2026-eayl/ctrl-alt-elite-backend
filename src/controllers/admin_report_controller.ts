import type { Request, Response } from 'express';
import { validateRequest } from '../middleware/validateRequest';
import { salesReportQuerySchema } from '../models/admin_report_model';
import type { AdminReportService } from '../service/admin_report_service';

export function createAdminReportController(service: AdminReportService) {
  return {
    sales: async (req: Request, res: Response) => {
      const query = validateRequest(salesReportQuerySchema, req.query);
      res.status(200).json(await service.sales(query));
    },
  };
}
