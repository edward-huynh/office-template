import type { DocType } from '../contracts/index.js';
import type { DocumentPool } from '../infra/workers/document-pool.js';
import { getBaseHandler } from './registry.js';
import type { DocTypeHandler } from './types.js';

/** Operations that read or rewrite a whole document: zip, XML and HTML work that belongs off the main thread. */
const HEAVY = ['validate', 'toEditorContent', 'fromEditorContent', 'readSlides', 'applySlideEdits', 'duplicateSlide', 'deleteSlide'] as const;

/**
 * A view of the document type handlers whose heavy operations run in the worker pool. Metadata
 * (type, MIME type, extension) stays local; only the methods the base handler implements are proxied.
 */
export function pooledHandlers(pool: DocumentPool): (type: DocType) => DocTypeHandler {
  const cache = new Map<DocType, DocTypeHandler>();
  return (type) => {
    const cached = cache.get(type);
    if (cached) return cached;
    const base = getBaseHandler(type);
    const proxy: Record<string, unknown> = { ...base };
    for (const method of HEAVY) {
      if (typeof (base as unknown as Record<string, unknown>)[method] === 'function') {
        proxy[method] = (...args: unknown[]) => pool.call(type, method, args);
      }
    }
    const handler = proxy as unknown as DocTypeHandler;
    cache.set(type, handler);
    return handler;
  };
}
