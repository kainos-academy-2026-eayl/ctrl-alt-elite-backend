import express from 'express';
import { createCatalogController } from '../controllers/catalog_controller';
import { createProductTranslationController } from '../controllers/product_translation_controller';
import type { PrismaClient } from '../generated/prisma/client';
import { createCatalogRepository } from '../repo/catalog_repository';
import { createProductTranslationRepository } from '../repo/product_translation_repository';
import { createCatalogService } from '../service/catalog_service';

export function createCatalogRouter(database: PrismaClient) {
  const router = express.Router();
  const repository = createCatalogRepository(database);
  const translations = createProductTranslationRepository(database);
  const service = createCatalogService(repository, translations.findByLocale);
  const controller = createCatalogController(service);
  const translationController =
    createProductTranslationController(translations);

  router.get('/products', controller.getAll);
  // Must come before /products/:id, or these words would be treated as ids.
  router.get('/products/search', controller.search);
  router.get('/products/popular', controller.getPopular);
  router.get('/products/:id', controller.getById);
  router.get('/product-translations', translationController.getByLocale);

  return router;
}
