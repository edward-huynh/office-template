import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createdDocumentSchema,
  deckSchema,
  documentListSchema,
  documentSchema,
  editorContentSchema,
  slideEditsSchema,
  slugSchema,
  updateDocumentSchema,
} from '../../contracts/index.js';
import type { AppBindings } from '../../shared/types.js';
import { ok } from '../../shared/utils/api-response.js';
import { errorResponse, jsonResponse, streamResponse } from '../../shared/utils/openapi.js';
import type { DocumentsService } from './documents.service.js';

const idParam = z.object({ id: z.string().uuid() });

const useRoute = createRoute({
  method: 'post',
  path: '/templates/{id}/use',
  tags: ['Documents'],
  summary: 'Create a document from a template (copy-on-use)',
  description: 'Copies the template file into a new document owned by the current session. The template is never modified.',
  request: { params: z.object({ id: slugSchema }) },
  responses: {
    201: jsonResponse(createdDocumentSchema, 'The new document id'),
    404: errorResponse('Template not found'),
  },
});

const listRoute = createRoute({
  method: 'get',
  path: '/documents',
  tags: ['Documents'],
  summary: 'List documents of the current session',
  responses: { 200: jsonResponse(documentListSchema, 'Documents, most recently updated first') },
});

const detailRoute = createRoute({
  method: 'get',
  path: '/documents/{id}',
  tags: ['Documents'],
  summary: 'Get one document',
  request: { params: idParam },
  responses: {
    200: jsonResponse(documentSchema, 'The document'),
    404: errorResponse('Document not found'),
  },
});

const getContentRoute = createRoute({
  method: 'get',
  path: '/documents/{id}/content',
  tags: ['Documents'],
  summary: 'Editor content of a DOCX document as sanitized HTML',
  request: { params: idParam },
  responses: {
    200: jsonResponse(editorContentSchema, 'HTML for the editor'),
    400: errorResponse('The document type has no in-app editor'),
    404: errorResponse('Document not found'),
  },
});

const putContentRoute = createRoute({
  method: 'put',
  path: '/documents/{id}/content',
  tags: ['Documents'],
  summary: 'Save edited content into the document copy',
  request: {
    params: idParam,
    body: { required: true, content: { 'application/json': { schema: updateDocumentSchema } } },
  },
  responses: {
    200: jsonResponse(documentSchema, 'The updated document'),
    400: errorResponse('The document type has no in-app editor'),
    404: errorResponse('Document not found'),
    422: errorResponse('Invalid body'),
  },
});

const slideIndexParam = z.object({ id: z.string().uuid(), index: z.coerce.number().int().min(0).max(999) });

const getSlidesRoute = createRoute({
  method: 'get',
  path: '/documents/{id}/slides',
  tags: ['Documents'],
  summary: 'Slides of a PPTX document as a render-ready model',
  description: 'Positions are CSS pixels at 96 dpi, font sizes are points. Pictures are inlined as data URIs.',
  request: { params: idParam },
  responses: {
    200: jsonResponse(deckSchema, 'The deck'),
    400: errorResponse('The document type has no slides'),
    404: errorResponse('Document not found'),
  },
});

const putSlidesRoute = createRoute({
  method: 'put',
  path: '/documents/{id}/slides',
  tags: ['Documents'],
  summary: 'Save text edits into the slides of the document copy',
  description: 'Only the listed shapes are changed; everything else in the slide XML is preserved.',
  request: {
    params: idParam,
    body: { required: true, content: { 'application/json': { schema: slideEditsSchema } } },
  },
  responses: {
    200: jsonResponse(documentSchema, 'The updated document'),
    400: errorResponse('Unknown slide or shape, or the document type has no slides'),
    404: errorResponse('Document not found'),
    422: errorResponse('Invalid body'),
  },
});

const duplicateSlideRoute = createRoute({
  method: 'post',
  path: '/documents/{id}/slides/{index}/duplicate',
  tags: ['Documents'],
  summary: 'Duplicate a slide (the copy is placed right after it)',
  request: { params: slideIndexParam },
  responses: {
    200: jsonResponse(deckSchema, 'The updated deck'),
    400: errorResponse('Unknown slide'),
    404: errorResponse('Document not found'),
  },
});

const deleteSlideRoute = createRoute({
  method: 'delete',
  path: '/documents/{id}/slides/{index}',
  tags: ['Documents'],
  summary: 'Delete a slide (the last remaining slide cannot be deleted)',
  request: { params: slideIndexParam },
  responses: {
    200: jsonResponse(deckSchema, 'The updated deck'),
    400: errorResponse('Unknown slide, or it is the last one'),
    404: errorResponse('Document not found'),
  },
});

const downloadRoute = createRoute({
  method: 'get',
  path: '/documents/{id}/download',
  tags: ['Documents'],
  summary: 'Download the document file',
  request: { params: idParam },
  responses: {
    200: {
      description: 'The DOCX or PPTX file',
      content: { 'application/octet-stream': { schema: z.string().openapi({ type: 'string', format: 'binary' }) } },
    },
    404: errorResponse('Document not found'),
  },
});

export const documentsRoutes = (documents: DocumentsService) =>
  new OpenAPIHono<AppBindings>()
    .openapi(useRoute, async (c) => {
      const result = await documents.useTemplate(c.req.valid('param').id, c.get('sessionId'));
      return c.json(ok(result), 201);
    })
    .openapi(listRoute, (c) => c.json(ok({ items: documents.list(c.get('sessionId')) }), 200))
    .openapi(detailRoute, (c) => c.json(ok(documents.get(c.req.valid('param').id, c.get('sessionId'))), 200))
    .openapi(getContentRoute, async (c) =>
      c.json(ok(await documents.getContent(c.req.valid('param').id, c.get('sessionId'))), 200),
    )
    .openapi(putContentRoute, async (c) => {
      const updated = await documents.updateContent(c.req.valid('param').id, c.get('sessionId'), c.req.valid('json'));
      return c.json(ok(updated), 200);
    })
    .openapi(getSlidesRoute, async (c) =>
      c.json(ok(await documents.getSlides(c.req.valid('param').id, c.get('sessionId'))), 200),
    )
    .openapi(putSlidesRoute, async (c) =>
      c.json(ok(await documents.updateSlides(c.req.valid('param').id, c.get('sessionId'), c.req.valid('json'))), 200),
    )
    .openapi(duplicateSlideRoute, async (c) => {
      const { id, index } = c.req.valid('param');
      return c.json(ok(await documents.duplicateSlide(id, c.get('sessionId'), index)), 200);
    })
    .openapi(deleteSlideRoute, async (c) => {
      const { id, index } = c.req.valid('param');
      return c.json(ok(await documents.deleteSlide(id, c.get('sessionId'), index)), 200);
    })
    .openapi(downloadRoute, async (c) => {
      const file = await documents.download(c.req.valid('param').id, c.get('sessionId'));
      const encoded = encodeURIComponent(file.fileName);
      return streamResponse(file.stream, {
        'Content-Type': file.mimeType,
        'Content-Length': String(file.size),
        'Content-Disposition': `attachment; filename="${file.fileName.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encoded}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      }) as never;
    });
