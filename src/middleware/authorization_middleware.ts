import type { RequestHandler } from 'express';
import { errors, jwtVerify, SignJWT } from 'jose';
import type { PrismaClient } from '../generated/prisma/client';
import type { UserRole } from '../models/login_model';

const issuer = 'ctrl-alt-elite-backend';
const audience = 'ctrl-alt-elite-api';

export function createAuthorization(database: PrismaClient, secret: string) {
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes.');
  }
  const key = new TextEncoder().encode(secret);

  async function issueToken(userId: string) {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
  }

  function requireRole(
    roles: readonly UserRole[],
    accessLabel: string,
    privileges: string,
  ): RequestHandler {
    return async (req, res, next) => {
      const denyAuthentication = () => {
        console.warn(`${accessLabel} access denied`, {
          reason: 'Invalid authentication',
        });
        res.setHeader('WWW-Authenticate', 'Bearer');
        res.status(401).json({ message: 'Authentication required.' });
      };
      const match = /^Bearer ([^\s]+)$/i.exec(req.get('authorization') ?? '');
      const token = match?.[1];
      if (!token) {
        denyAuthentication();
        return;
      }

      let userId: string;
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'],
          issuer,
          audience,
          requiredClaims: ['sub', 'iat', 'exp'],
          maxTokenAge: '1h',
        });
        if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
          denyAuthentication();
          return;
        }
        userId = payload.sub;
      } catch (error) {
        if (!(error instanceof errors.JOSEError)) throw error;
        denyAuthentication();
        return;
      }

      const user = await database.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (!user) {
        denyAuthentication();
        return;
      }
      if (!(roles as readonly string[]).includes(user.role)) {
        console.warn(`${accessLabel} access denied`, {
          reason: `${privileges} privileges required`,
        });
        res.status(403).json({
          message: `Access denied. ${privileges} privileges required.`,
        });
        return;
      }
      res.locals.userId = userId;
      next();
    };
  }

  return {
    issueToken,
    requireAdmin: requireRole(['ADMIN'], 'Admin', 'Administrator'),
    requireStaff: requireRole(
      ['ADMIN', 'CUSTOMER_SERVICE'],
      'Staff',
      'Administrator or customer service',
    ),
    requireTicketUser: requireRole(
      ['CUSTOMER', 'ADMIN'],
      'Support ticket',
      'Customer or administrator',
    ),
  };
}
