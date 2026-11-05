import type { Request, Response } from 'express';
import { normalisePopularLimit } from '../models/popular_products_model';
import { parseProductFilters } from '../models/product_filter_model';
import { normaliseSearchTerm } from '../models/product_search_model';
import { normaliseTranslationLocale } from '../models/product_translation_model';
import type { CatalogService } from '../service/catalog_service';

export function createCatalogController(service: CatalogService) {
  return {
    getAll: async (req: Request, res: Response) => {
      const result = await service.getAll(parseProductFilters(req.query));
      res.status(200).json(result);
    },
    search: async (req: Request, res: Response) => {
      const searchTerm = normaliseSearchTerm(req.query.q);
      const result = await service.search(
        searchTerm,
        parseProductFilters(req.query),
        normaliseTranslationLocale(req.query.lang),
      );
      res.status(200).json({ searchTerm, ...result });
    },
    getPopular: async (req: Request, res: Response) => {
      const limit = normalisePopularLimit(req.query.limit);
      const products = await service.getPopular(limit);
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
