import { createMiddleware } from 'hono/factory';
import type { AppBindings } from '../types.js';

/**
 * Marks responses as private and uncacheable. Used for documents: they belong to one visitor and
 * change on every save, so a browser or proxy must never reuse an earlier response. A route that
 * sets its own Cache-Control (the download) keeps it.
 */
export const noStore = createMiddleware<AppBindings>(async (c, next) => {
  await next();
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'private, no-store');
});
