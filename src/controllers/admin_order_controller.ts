import type { Request, Response } from 'express';
import { validateRequest } from '../middleware/validateRequest';
import {
  adminOrderParamsSchema,
  adminOrderQuerySchema,
} from '../models/admin_order_model';
import type { AdminOrderService } from '../service/admin_order_service';

export function createAdminOrderController(service: AdminOrderService) {
  return {
    list: async (req: Request, res: Response) => {
      const query = validateRequest(adminOrderQuerySchema, req.query);
      res.status(200).json(await service.list(query));
    },
    get: async (req: Request, res: Response) => {
      const { id } = validateRequest(adminOrderParamsSchema, req.params);
      res.status(200).json(await service.get(id));
    },
  };
}
