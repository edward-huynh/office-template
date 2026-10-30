import { randomUUID } from 'node:crypto';
import { getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { AppBindings } from '../types.js';

export const SESSION_COOKIE = 'ot_sid';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Anonymous sessions: a random UUID in an httpOnly cookie scopes "My documents".
 * There is no account system; this is the seam where real authentication would plug in.
 */
export const sessionMiddleware = (options: { secure: boolean }) =>
  createMiddleware<AppBindings>(async (c, next) => {
    let sessionId = getCookie(c, SESSION_COOKIE);
    if (!sessionId || !UUID.test(sessionId)) {
      sessionId = randomUUID();
      setCookie(c, SESSION_COOKIE, sessionId, {
        httpOnly: true,
        sameSite: 'Lax',
        secure: options.secure,
        path: '/',
        maxAge: ONE_YEAR,
      });
    }
    c.set('sessionId', sessionId);
    await next();
  });
