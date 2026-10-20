import cors from 'cors'
import express, {
  type ErrorRequestHandler,
  type Express,
  type Request,
  type Response,
} from 'express'
import { Prisma, type PrismaClient } from './generated/prisma/client'
import {
  RegistrationValidationError,
  registerUser,
  validateRegistration,
} from './registration'

export function createApp(
  database: PrismaClient,
  frontendOrigin: string,
): Express {
  const app = express()
  app.use(cors({ origin: frontendOrigin }))
  app.use(express.json({ limit: '16kb' }))

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() })
  })

  app.post('/api/auth/register', async (req: Request, res: Response) => {
    if (!req.is('application/json')) {
      res
        .status(415)
        .json({ message: 'Content-Type must be application/json.' })
      return
    }
    const registration = validateRegistration(req.body)
    const user = await registerUser(database, registration)
    res.status(201).json({ user })
  })

  const handleError: ErrorRequestHandler = (
    error: unknown,
    _req,
    res,
    _next,
  ) => {
    if (error instanceof RegistrationValidationError) {
      res.status(400).json({ message: error.message })
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      res
        .status(409)
        .json({ message: 'An account with this email already exists.' })
    } else if (
      error instanceof SyntaxError &&
      'type' in error &&
      error.type === 'entity.parse.failed'
    ) {
      res.status(400).json({ message: 'Request body must contain valid JSON.' })
    } else if (
      error instanceof Error &&
      'type' in error &&
      error.type === 'entity.too.large'
    ) {
      res.status(413).json({ message: 'Request body is too large.' })
    } else {
      console.error(
        'Request failed',
        error instanceof Error ? error.name : 'Unknown error',
      )
      res.status(500).json({ message: 'Unable to complete the request.' })
    }
  }
  app.use(handleError)

  return app
}
