import express, { type RequestHandler } from 'express';
import { createOrderHistoryController } from '../controllers/order_histroy_controller';
import type { PrismaClient } from '../generated/prisma/client';
import { noStore } from '../middleware/no_store';
import { createOrderHistoryRepository } from '../repo/order_history_repository';
import { createOrderHistoryService } from '../service/order_histroy_service';

export function createOrderHistoryRouter(
  database: PrismaClient,
  requireUser: RequestHandler,
) {
  const router = express.Router();
  const repository = createOrderHistoryRepository(database);
  const service = createOrderHistoryService(repository);
  const controller = createOrderHistoryController(service);

  router.get('/orders', noStore, requireUser, controller.getAll);

  return router;
}
