import express from 'express';
import { createCatalogController } from '../controllers/catalog_controller';
import type { PrismaClient } from '../generated/prisma/client';
import { createCatalogRepository } from '../repo/catalog_repository';
import { createCatalogService } from '../service/catalog_service';

export function createCatalogRouter(database: PrismaClient) {
  const router = express.Router();
  const repository = createCatalogRepository(database);
  const service = createCatalogService(repository);
  const controller = createCatalogController(service);

  router.get('/products', controller.getAll);
  router.get('/products/:id', controller.getById);

  return router;
}
