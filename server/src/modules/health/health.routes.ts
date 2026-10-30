import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { ok } from '../../shared/utils/api-response.js';

const route = createRoute({
  method: 'get',
  path: '/',
  tags: ['Health'],
  summary: 'Liveness check',
  responses: {
    200: {
      description: 'The service is running',
      content: {
        'application/json': {
          schema: z.object({ success: z.literal(true), data: z.object({ status: z.literal('ok'), uptime: z.number() }) }),
        },
      },
    },
  },
});

export const healthRoutes = () =>
  new OpenAPIHono().openapi(route, (c) => c.json(ok({ status: 'ok' as const, uptime: Math.round(process.uptime()) }), 200));
