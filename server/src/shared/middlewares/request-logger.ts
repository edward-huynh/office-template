import { createMiddleware } from 'hono/factory';
import type { Logger } from '../utils/logger.js';

export const requestLogger = (logger: Logger) =>
  createMiddleware(async (c, next) => {
    const start = performance.now();
    await next();
    logger.info(
      { method: c.req.method, path: c.req.path, status: c.res.status, ms: Math.round(performance.now() - start) },
      'request',
    );
  });
