import type { DocType } from '../contracts/index.js';
import { ApiError } from '../shared/errors/api-error.js';
import { docxHandler } from './docx/docx-handler.js';
import { pptxHandler } from './pptx/pptx-handler.js';
import type { DocTypeHandler } from './types.js';

/** Register new Office formats here (for example an XLSX handler). */
const handlers: DocTypeHandler[] = [docxHandler, pptxHandler];

const byType = new Map<DocType, DocTypeHandler>(handlers.map((handler) => [handler.type, handler]));

/** The real handlers. The worker thread uses these; the API's main thread goes through `getHandler` or a pool. */
export function getBaseHandler(type: DocType): DocTypeHandler {
  const handler = byType.get(type);
  if (!handler) throw ApiError.badRequest(`Unsupported document type: ${type}`);
  return handler;
}

export const getHandler = getBaseHandler;

/** Detects the document type from the file contents (never from the client-supplied name). */
export async function detectDocType(file: Buffer): Promise<DocType> {
  for (const handler of handlers) {
    try {
      await handler.validate(file);
      return handler.type;
    } catch {
      /* not this type */
    }
  }
  throw ApiError.unsupportedMediaType('Only valid DOCX and PPTX files are supported');
}
