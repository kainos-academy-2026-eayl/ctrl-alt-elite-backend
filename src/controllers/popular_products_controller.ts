import type { Request, Response } from 'express';
import { normalisePopularLimit } from '../models/popular_products_model';
import type { PopularProductsService } from '../service/popular_products_service';

export function createPopularProductsController(
  service: PopularProductsService,
) {
  return {
    getPopular: async (req: Request, res: Response) => {
      const limit = normalisePopularLimit(req.query.limit);
      const products = await service.getPopular(limit);
      res.status(200).json({ products });
    },
  };
}
