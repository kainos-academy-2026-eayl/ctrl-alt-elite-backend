import express from 'express';
import { createAdminOrderController } from '../controllers/admin_order_controller';
import {
  type AdminOrderDatabase,
  createAdminOrderRepository,
} from '../repo/admin_order_repository';
import { createAdminOrderService } from '../service/admin_order_service';

export function createAdminOrderRouter(database: AdminOrderDatabase) {
  const router = express.Router();
  const controller = createAdminOrderController(
    createAdminOrderService(createAdminOrderRepository(database)),
  );

  router.get('/', controller.list);
  router.get('/:id', controller.get);

  return router;
}
