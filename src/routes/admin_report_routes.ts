import express from 'express';
import { createAdminReportController } from '../controllers/admin_report_controller';
import {
  type AdminReportDatabase,
  createAdminReportRepository,
} from '../repo/admin_report_repository';
import { createAdminReportService } from '../service/admin_report_service';

export function createAdminReportRouter(database: AdminReportDatabase) {
  const router = express.Router();
  const controller = createAdminReportController(
    createAdminReportService(createAdminReportRepository(database)),
  );

  router.get('/sales', controller.sales);

  return router;
}
