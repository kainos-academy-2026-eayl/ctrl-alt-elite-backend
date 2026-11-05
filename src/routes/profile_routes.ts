import express, { type RequestHandler, Router } from 'express';
import { ProfileController } from '../controllers/profile_controller';
import type { PrismaClient } from '../generated/prisma/client';
import { noStore } from '../middleware/no_store';
import {
  MAX_PROFILE_PHOTO_BYTES,
  PROFILE_PHOTO_TYPES,
} from '../models/profile_model';
import { createProfileService } from '../service/profile_service';

export function createProfileRouter(
  database: PrismaClient,
  requireAuthenticatedUser: RequestHandler,
) {
  const router = Router();
  const controller = new ProfileController(createProfileService(database));
  router.use(noStore, requireAuthenticatedUser);
  router.get('/', controller.get);
  router.patch('/', controller.update);
  router.get('/photo', controller.getPhoto);
  router.put(
    '/photo',
    (req, res, next) => {
      if (!req.is(PROFILE_PHOTO_TYPES)) {
        res.status(415).json({ message: 'Choose a JPG, PNG or WebP picture.' });
        return;
      }
      next();
    },
    express.raw({ type: PROFILE_PHOTO_TYPES, limit: MAX_PROFILE_PHOTO_BYTES }),
    controller.uploadPhoto,
  );
  router.delete('/photo', controller.removePhoto);
  return router;
}
