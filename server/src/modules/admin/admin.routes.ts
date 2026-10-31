import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { adminUploadFieldsSchema, slugSchema, templateSchema } from '../../contracts/index.js';
import { detectDocType } from '../../doctypes/registry.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { ok, toFieldErrors } from '../../shared/utils/api-response.js';
import { errorResponse, jsonResponse } from '../../shared/utils/openapi.js';
import type { Services } from '../../shared/types.js';
import { toTemplateDto } from '../templates/templates.service.js';

const uploadSchema = adminUploadFieldsSchema.extend({
  file: z.instanceof(File).openapi({ type: 'string', format: 'binary' }),
});

const uploadRoute = createRoute({
  method: 'post',
  path: '/templates',
  tags: ['Admin'],
  summary: 'Add or update a template',
  description:
    'The type (DOCX or PPTX) is detected from the file contents. ' +
    'Uploading an existing id with a different file creates a new template version.',
  request: { body: { required: true, content: { 'multipart/form-data': { schema: uploadSchema } } } },
  responses: {
    200: jsonResponse(templateSchema, 'Existing template updated'),
    201: jsonResponse(templateSchema, 'Template created'),
    413: errorResponse('File too large'),
    415: errorResponse('Not a valid DOCX or PPTX file'),
    422: errorResponse('Invalid form fields'),
  },
});

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export const adminRoutes = ({ env, importer, previews }: Services) => {
  const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
  return new OpenAPIHono().openapi(
    uploadRoute,
    async (c) => {
      const { file, name, category, description, id } = c.req.valid('form');
      if (file.size > maxBytes) throw ApiError.payloadTooLarge(`Files are limited to ${env.MAX_UPLOAD_MB} MB`);

      const bytes = Buffer.from(await file.arrayBuffer());
      const type = await detectDocType(bytes);

      const resolvedId = id ?? slugify(name);
      const idCheck = slugSchema.safeParse(resolvedId);
      if (!idCheck.success) {
        throw ApiError.validation('Invalid request data', toFieldErrors(idCheck.error));
      }

      const preview = await previews.generate({ file: bytes, type, name });
      const { status, row } = await importer.import({
        id: idCheck.data,
        type,
        name,
        category,
        description,
        file: bytes,
        thumbnail: preview.thumbnail,
        pages: preview.pages,
      });
      return c.json(ok(toTemplateDto(row)), status === 'created' ? 201 : 200);
    },
    // Reject oversized bodies before they are buffered.
    // The multipart envelope adds a little overhead on top of the file itself.
  ).use(
    '*',
    bodyLimit({
      maxSize: maxBytes + 64 * 1024,
      onError: () => {
        throw ApiError.payloadTooLarge(`Files are limited to ${env.MAX_UPLOAD_MB} MB`);
      },
    }),
  );
};
