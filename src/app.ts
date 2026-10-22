import cors from 'cors';
import express, {
  type Express,
  type Request,
  type Response,
  Router,
} from 'express';
import { BasketController } from './controllers/basketController';
import type { PrismaClient } from './generated/prisma/client';
import { createAuthorization } from './middleware/authorization_middleware';
import { ErrorHandler } from './middleware/error_handler_middleware';
import { createBasketRouter } from './routes/basketRouter';
import { createCatalogRouter } from './routes/catalog_routes';
import {
  changeAdminPassword,
  getAdminProfile,
  updateAdminProfile,
  validatePasswordChange,
  validateProfileUpdate,
} from './service/admin_service';
import {
  getCustomer,
  listCustomers,
  resetCustomerPassword,
  updateCustomer,
  validateCustomerPasswordReset,
  validateCustomerQuery,
  validateCustomerUpdate,
} from './service/customer_service';
import { authenticateUser } from './service/login_service';
import {
  registerUser,
  validateRegistration,
} from './service/registration_service';
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
  jwtSecret: string,
  services: AppServices = createServices(database),
): Express {
  const { issueToken, requireAdmin } = createAuthorization(database, jwtSecret);
  const app = express();
  app.use(cors({ origin: frontendOrigin }));
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/api', createCatalogRouter(database));

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
    const authenticated = await authenticateUser(database, req.body);
    if (!authenticated) {
      res.status(401).json({ message: 'Incorrect email or password.' });
      return;
    }
    const token = await issueToken(authenticated.userId);
    res.json({ ...authenticated, token });
  });

  const customers = Router();
  customers.get('/', async (req: Request, res: Response) => {
    const query = validateCustomerQuery(req.query);
    res.json(await listCustomers(database, query));
  });

  customers.get('/:id', async (req: Request, res: Response) => {
    res.json({ customer: await getCustomer(database, String(req.params.id)) });
  });

  customers.put('/:id', async (req: Request, res: Response) => {
    if (!req.is('application/json')) {
      res
        .status(415)
        .json({ message: 'Content-Type must be application/json.' });
      return;
    }
    const customer = validateCustomerUpdate(req.body);
    res.json({
      customer: await updateCustomer(database, String(req.params.id), customer),
    });
  });

  customers.put('/:id/password', async (req: Request, res: Response) => {
    if (!req.is('application/json')) {
      res
        .status(415)
        .json({ message: 'Content-Type must be application/json.' });
      return;
    }
    const change = validateCustomerPasswordReset(req.body);
    await resetCustomerPassword(database, String(req.params.id), change);
    res.json({ message: 'Password reset successfully.' });
  });

  app.use('/api/admin', requireAdmin);

  app.get('/api/admin/profile', async (_req: Request, res: Response) => {
    res.json(await getAdminProfile(database, res.locals.userId));
  });

  app.put('/api/admin/profile', async (req: Request, res: Response) => {
    if (!req.is('application/json')) {
      res
        .status(415)
        .json({ message: 'Content-Type must be application/json.' });
      return;
    }
    const profile = validateProfileUpdate(req.body);
    res.json(await updateAdminProfile(database, res.locals.userId, profile));
  });

  app.put('/api/admin/change-password', async (req: Request, res: Response) => {
    if (!req.is('application/json')) {
      res
        .status(415)
        .json({ message: 'Content-Type must be application/json.' });
      return;
    }
    const change = validatePasswordChange(req.body);
    await changeAdminPassword(database, res.locals.userId, change);
    res.json({ message: 'Password updated successfully.' });
  });

  app.use('/api/admin/customers', customers);
  app.use('/api/customers', requireAdmin, customers);

  app.use(
    '/api/baskets',
    createBasketRouter(new BasketController(services.basketService)),
  );

  const errorHandler = new ErrorHandler();
  app.use(errorHandler.handle);

  return app;
}
