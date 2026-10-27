import { Router } from 'express';
import type { BasketController } from '../controllers/basketController';
import { requireJson } from '../middleware/requireJson';

export function createBasketRouter(controller: BasketController): Router {
  const router = Router();

  router.post('/', controller.createBasket);
  router.get('/:basketId', controller.getBasket);
  router.post('/:basketId/items', requireJson, controller.addItem);
  router.patch(
    '/:basketId/items/:productId',
    requireJson,
    controller.updateItemQuantity,
  );
  router.delete('/:basketId/items/:productId', controller.removeItem);

  return router;
}
