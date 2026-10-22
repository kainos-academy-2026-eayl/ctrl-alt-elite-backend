import { Router } from 'express';
import type { ProductController } from '../controllers/productController';

export function createProductRouter(controller: ProductController): Router {
  const router = Router();

  router.get('/search', controller.searchProducts);

  return router;
}
