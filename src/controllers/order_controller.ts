import type { Request, Response } from 'express';
import { validateRequest } from '../middleware/validateRequest';
import { OrderParamsSchema, orderSchema } from '../models/order_model';
import type { OrderService } from '../service/order_service';

// The signed-in user always comes from the verified token (res.locals.userId),
// never from the request body.
export function createOrderController(service: OrderService) {
  return {
    getAccount: async (_req: Request, res: Response) => {
      const account = await service.getAccount(res.locals.userId);
      res.status(200).json({ account });
    },
    getDeliveryOptions: (_req: Request, res: Response) => {
      res.status(200).json({ deliveryOptions: service.listDeliveryOptions() });
    },
    placeOrder: async (req: Request, res: Response) => {
      const input = validateRequest(orderSchema, req.body);
      const result = await service.placeOrder(res.locals.userId, input);
      res.status(201).location(`/api/orders/${result.order.id}`).json(result);
    },
    getOrder: async (req: Request, res: Response) => {
      const { orderId } = validateRequest(OrderParamsSchema, req.params);
      res.status(200).json(await service.getOrder(res.locals.userId, orderId));
    },
  };
}
