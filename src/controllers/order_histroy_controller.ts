import type { Request, Response } from 'express';
import type { OrderHistoryService } from '../service/order_histroy_service';

export function createOrderHistoryController(service: OrderHistoryService) {
  return {
    getAll: async (_req: Request, res: Response) => {
      const customerId: unknown = res.locals.userId;
      if (typeof customerId !== 'string') {
        res.status(401).json({ message: 'Authentication required.' });
        return;
      }

      const orders = await service.getAll(customerId);
      res.status(200).json({ orders });
    },
  };
}
