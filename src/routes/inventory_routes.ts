import { Router } from 'express';
import type { PrismaClient } from '../generated/prisma/client';
import { noStore } from '../middleware/no_store';
import { requireJson } from '../middleware/requireJson';
import {
  getInventoryDashboard,
  listInventory,
  listLowStock,
  setOutOfStock,
  updateStock,
  validateOutOfStockUpdate,
  validateStockUpdate,
} from '../service/inventory_service';

export function createInventoryRouter(database: PrismaClient): Router {
  const router = Router();
  router.use(noStore);

  router.get('/dashboard', async (_req, res) => {
    res.json(await getInventoryDashboard(database));
  });

  router.get('/low-stock', async (_req, res) => {
    res.json({ products: await listLowStock(database) });
  });

  router.get('/', async (_req, res) => {
    res.json({ products: await listInventory(database) });
  });

  router.put('/:id/stock', requireJson, async (req, res) => {
    const input = validateStockUpdate(req.body);
    res.json({
      product: await updateStock(database, String(req.params.id), input),
    });
  });

  router.put('/:id/out-of-stock', requireJson, async (req, res) => {
    const input = validateOutOfStockUpdate(req.body);
    res.json({
      product: await setOutOfStock(database, String(req.params.id), input),
    });
  });

  return router;
}
