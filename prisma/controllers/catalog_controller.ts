import type { Request, Response } from 'express';
import type { CatalogService } from '../../src/service/catalog_service';

export function createCatalogController(service: CatalogService) {
  return {
    getAll: async (_req: Request, res: Response) => {
      const products = await service.getAll();
      res.status(200).json({ products });
    },
    getById: async (req: Request, res: Response) => {
      const id = req.params.id;
      if (typeof id !== 'string') {
        res.status(404).json({ message: 'Product not found.' });
        return;
      }
      const product = await service.getById(id);
      if (!product) {
        res.status(404).json({ message: 'Product not found.' });
        return;
      }
      res.status(200).json({ product });
    },
  };
}
