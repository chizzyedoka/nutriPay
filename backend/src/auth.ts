import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from './config.js';

export type AuthenticatedRequest = Request & { userId?: string };

export function optionalAuth(request: AuthenticatedRequest, _response: Response, next: NextFunction) {
  const token = request.cookies?.accessToken as string | undefined;
  if (token) {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
      request.userId = payload.sub;
    } catch {
      // Treat an expired optional session as a public request.
    }
  }
  return next();
}

export function requireAuth(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  const token = request.cookies?.accessToken as string | undefined;
  if (!token) return response.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
    request.userId = payload.sub;
    return next();
  } catch {
    return response.status(401).json({ error: 'Invalid or expired session' });
  }
}
