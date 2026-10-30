import { timingSafeEqual } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import { ApiError } from '../errors/api-error.js';

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/** Guards `/admin/*` with a static token sent in the `x-admin-token` header. */
export const adminAuth = (expectedToken: string | undefined) =>
  createMiddleware(async (c, next) => {
    const provided = c.req.header('x-admin-token');
    if (!expectedToken || !provided || !safeEqual(provided, expectedToken)) {
      throw ApiError.unauthorized('A valid admin token is required');
    }
    await next();
  });
