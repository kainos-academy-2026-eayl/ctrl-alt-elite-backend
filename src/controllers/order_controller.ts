import type { Request, Response } from 'express';
import type { OrderService } from '../service/order_service';

export function createOrderController(service: OrderService) {
  return {
    create: async (req: Request, res: Response): Promise<void> => {
      const customerId: unknown = res.locals.userId;

      if (typeof customerId !== 'string' || customerId.trim() === '') {
        console.warn('Order access denied', {
          reason: 'Missing authenticated user ID',
        });
        res.setHeader('WWW-Authenticate', 'Bearer');
        res.status(401).json({ message: 'Authentication required.' });
        return;
      }

      const order = await service.create(customerId, req.body);

      res.status(201).json({ order });
    },
  };
}

export type OrderController = ReturnType<typeof createOrderController>;
