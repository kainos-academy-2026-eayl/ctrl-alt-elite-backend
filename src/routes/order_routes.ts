import express, { type RequestHandler } from 'express';
import { createOrderController } from '../controllers/order_controller';
import { noStore } from '../middleware/no_store';
import { requireJson } from '../middleware/requireJson';
import type { OrderDatabase } from '../models/order_model';
import { createOrderRepository } from '../repo/order_repository';
import { createOrderService } from '../service/order_service';

export function createOrderRouter(
  database: OrderDatabase,
  requireUser: RequestHandler,
) {
  const router = express.Router();
  const repository = createOrderRepository(database);
  const service = createOrderService(repository);
  const controller = createOrderController(service);

  router.get('/delivery-options', controller.getDeliveryOptions);
  // Account and order details are personal, so they are never cached.
  router.get('/account', noStore, requireUser, controller.getAccount);
  router.post(
    '/orders',
    noStore,
    requireUser,
    requireJson,
    controller.placeOrder,
  );
  router.get('/orders/:orderId', noStore, requireUser, controller.getOrder);

  return router;
}
