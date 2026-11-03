import express, { type RequestHandler } from 'express';
import { createOrderController } from '../controllers/order_controller';
import type { PrismaClient } from '../generated/prisma/client';
import { requireJson } from '../middleware/requireJson';
import { createOrderRepository } from '../repo/order_repository';
import { createOrderService } from '../service/order_service';

export function createOrderRouter(
  database: PrismaClient,
  requireAuth: RequestHandler,
) {
  const router = express.Router();
  const repository = createOrderRepository(database);
  const service = createOrderService(repository);
  const controller = createOrderController(service);

  router.post('/orders', requireAuth, requireJson, controller.create);

  return router;
}
