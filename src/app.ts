import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import { BasketController } from './controllers/basketController';
import { ErrorHandler } from './errorHandler';
import type { PrismaClient } from './generated/prisma/client';
import { registerUser, validateRegistration } from './registration';
import { createBasketRouter } from './routes/basketRouter';
import { BasketService } from './services/basketService';

export interface AppServices {
  basketService: BasketService;
}

export function createServices(database: PrismaClient): AppServices {
  return { basketService: new BasketService(database) };
}

export function createApp(
  database: PrismaClient,
  frontendOrigin: string,
  services: AppServices = createServices(database),
): Express {
  const app = express();
  app.use(cors({ origin: frontendOrigin }));
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.post('/api/auth/register', async (req: Request, res: Response) => {
    if (!req.is('application/json')) {
      res
        .status(415)
        .json({ message: 'Content-Type must be application/json.' });
      return;
    }
    const registration = validateRegistration(req.body);
    const user = await registerUser(database, registration);
    res.status(201).json({ user });
  });

  app.use(
    '/api/baskets',
    createBasketRouter(new BasketController(services.basketService)),
  );

  const errorHandler = new ErrorHandler();
  app.use(errorHandler.handle);

  return app;
}
