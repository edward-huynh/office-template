import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ErrorEnvelope } from '../../contracts/index.js';
import { ApiError } from '../errors/api-error.js';
import type { Logger } from '../utils/logger.js';

const envelope = (c: Context, statusCode: number, message: string, errors?: ErrorEnvelope['errors']) => {
  const body: ErrorEnvelope = { success: false, message, statusCode, ...(errors ? { errors } : {}) };
  return c.json(body, statusCode as ContentfulStatusCode);
};

export const createErrorHandler =
  (logger: Logger, exposeDetails: boolean): ErrorHandler =>
  (error, c) => {
    if (error instanceof ApiError) {
      if (error.statusCode >= 500) logger.error({ err: error }, error.message);
      return envelope(c, error.statusCode, error.message, error.errors);
    }
    if (error instanceof HTTPException) {
      return envelope(c, error.status, error.message);
    }
    logger.error({ err: error, path: c.req.path }, 'Unhandled error');
    return envelope(c, 500, exposeDetails && error instanceof Error ? error.message : 'Internal server error');
  };

export const notFoundHandler: NotFoundHandler = (c) =>
  envelope(c, 404, `Route ${c.req.method} ${c.req.path} was not found`);
