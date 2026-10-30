import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { slugSchema, templateListQuerySchema, templateListSchema, templateSchema } from '../../contracts/index.js';
import { ok } from '../../shared/utils/api-response.js';
import { errorResponse, jsonResponse, streamResponse } from '../../shared/utils/openapi.js';
import type { TemplateAsset, TemplatesService } from './templates.service.js';

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Templates'],
  summary: 'Search and filter templates',
  request: { query: templateListQuerySchema },
  responses: {
    200: jsonResponse(templateListSchema, 'A page of templates and the available categories'),
    422: errorResponse('Invalid query parameters'),
  },
});

const detailRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Templates'],
  summary: 'Get one template',
  request: { params: z.object({ id: slugSchema }) },
  responses: {
    200: jsonResponse(templateSchema, 'The template'),
    404: errorResponse('Template not found'),
  },
});

const imageContent = {
  'image/png': { schema: z.string().openapi({ type: 'string', format: 'binary' }) },
  'image/svg+xml': { schema: z.string().openapi({ type: 'string', format: 'binary' }) },
};

const thumbnailRoute = createRoute({
  method: 'get',
  path: '/{id}/thumbnail',
  tags: ['Templates'],
  summary: 'Template thumbnail image',
  request: { params: z.object({ id: slugSchema }) },
  responses: {
    200: { description: 'Image', content: imageContent },
    304: { description: 'Not modified' },
    404: errorResponse('Template or image not found'),
  },
});

const pageRoute = createRoute({
  method: 'get',
  path: '/{id}/pages/{index}',
  tags: ['Templates'],
  summary: 'Preview image of one page or slide',
  request: { params: z.object({ id: slugSchema, index: z.coerce.number().int().min(0).max(99) }) },
  responses: {
    200: { description: 'Image', content: imageContent },
    304: { description: 'Not modified' },
    404: errorResponse('Template or page not found'),
  },
});

/** Images are content-addressed through `?v=<checksum>`, so they can be cached for a year. */
function assetResponse(asset: TemplateAsset, ifNoneMatch: string | undefined): Response {
  const headers: Record<string, string> = {
    'Content-Type': asset.contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: asset.etag,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  };
  if (ifNoneMatch === asset.etag) {
    asset.stream.destroy();
    return new Response(null, { status: 304, headers });
  }
  headers['Content-Length'] = String(asset.size);
  return streamResponse(asset.stream, headers);
}

export const templatesRoutes = (templates: TemplatesService) =>
  new OpenAPIHono()
    .openapi(listRoute, (c) => c.json(ok(templates.list(c.req.valid('query'))), 200))
    .openapi(detailRoute, (c) => c.json(ok(templates.get(c.req.valid('param').id)), 200))
    .openapi(thumbnailRoute, async (c) => {
      const asset = await templates.getThumbnail(c.req.valid('param').id);
      return assetResponse(asset, c.req.header('if-none-match')) as never;
    })
    .openapi(pageRoute, async (c) => {
      const { id, index } = c.req.valid('param');
      const asset = await templates.getPreviewPage(id, index);
      return assetResponse(asset, c.req.header('if-none-match')) as never;
    });
