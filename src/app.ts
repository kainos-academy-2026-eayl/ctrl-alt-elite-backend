import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import { ErrorHandler } from './errorHandler';
import type { PrismaClient } from './generated/prisma/client';
import { authenticateUser, validateLogin } from './login';
import { registerUser, validateRegistration } from './registration';

export function createApp(
  database: PrismaClient,
  frontendOrigin: string,
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

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    if (!req.is('application/json')) {
      res
        .status(415)
        .json({ message: 'Content-Type must be application/json.' });
      return;
    }
    const login = validateLogin(req.body);
    const user = await authenticateUser(database, login);
    res.status(200).json({ user });
  });

  const errorHandler = new ErrorHandler();
  app.use(errorHandler.handle);

  return app;
}
