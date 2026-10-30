import { Router } from 'express';
import type { PrismaClient } from '../generated/prisma/client';
import { requireJson } from '../middleware/requireJson';
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
  validateProductCreate,
  validateProductUpdate,
} from '../service/admin_product_service';

export function createAdminProductRouter(database: PrismaClient): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json({ products: await listProducts(database) });
  });

  router.get('/:id', async (req, res) => {
    res.json({ product: await getProduct(database, String(req.params.id)) });
  });

  router.post('/', requireJson, async (req, res) => {
    const input = validateProductCreate(req.body);
    const product = await createProduct(database, input);
    res
      .location(`/api/admin/products/${encodeURIComponent(product.id)}`)
      .status(201)
      .json({ product });
  });

  router.put('/:id', requireJson, async (req, res) => {
    const input = validateProductUpdate(req.body);
    res.json({
      product: await updateProduct(database, String(req.params.id), input),
    });
  });

  router.delete('/:id', async (req, res) => {
    await deleteProduct(database, String(req.params.id));
    res.json({ message: 'Product deleted.' });
  });

  return router;
}
