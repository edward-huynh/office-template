import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';
import type { AppType } from '@office-template/server/app-type';
import type {
  Deck,
  DocumentList,
  EditorContent,
  OfficeDocument,
  SlideEdits,
  Template,
  TemplateList,
  UpdateDocumentInput,
} from '@office-template/server/contracts';
import { hc } from 'hono/client';

/**
 * One isomorphic API client. In the browser it calls `/api` on the page origin. During SSR it calls
 * the API server directly and forwards the visitor's cookie, so private pages render per session.
 */
const baseUrl = createIsomorphicFn()
  .server(() => process.env.API_INTERNAL_URL ?? 'http://localhost:3001')
  .client(() => window.location.origin);

const forwardedHeaders = createIsomorphicFn()
  .server((): Record<string, string> => {
    const cookie = getRequestHeader('cookie');
    return cookie ? { cookie } : {};
  })
  .client((): Record<string, string> => ({}));

/** Public origin of the current request (used for absolute `og:image` URLs). */
export const requestOrigin = createIsomorphicFn()
  .server(() => {
    const host = getRequestHeader('x-forwarded-host') ?? getRequestHeader('host') ?? 'localhost:3000';
    const proto = getRequestHeader('x-forwarded-proto') ?? 'http';
    return `${proto}://${host}`;
  })
  .client(() => window.location.origin);

const client = () => hc<AppType>(baseUrl(), { headers: () => forwardedHeaders() });

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/** Reads the `{ success, data }` envelope and throws `ApiClientError` for error envelopes. */
async function unwrap<T>(response: Response): Promise<T> {
  let body: any;
  try {
    body = await response.json();
  } catch {
    throw new ApiClientError(response.status, `The server returned an unexpected response (${response.status})`);
  }
  if (!response.ok || body?.success !== true) {
    throw new ApiClientError(response.status, body?.message ?? 'Request failed', body?.errors);
  }
  return body.data as T;
}

/** Network failures (API down) become a readable error instead of a bare "fetch failed". */
async function call<T>(request: () => Promise<Response>): Promise<T> {
  let response: Response;
  try {
    response = await request();
  } catch {
    throw new ApiClientError(503, 'The service is unreachable. Please try again in a moment.');
  }
  return unwrap<T>(response);
}

export interface TemplateSearch {
  /** Omit to search across every type. */
  type?: 'docx' | 'pptx';
  q?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}

export const fetchTemplates = (search: TemplateSearch) =>
  call<TemplateList>(() =>
    client().api.templates.$get({
      query: {
        ...(search.type ? { type: search.type } : {}),
        ...(search.q ? { q: search.q } : {}),
        ...(search.category ? { category: search.category } : {}),
        page: String(search.page ?? 1),
        pageSize: String(search.pageSize ?? 12),
      },
    }),
  );

export const fetchTemplate = (id: string) =>
  call<Template>(() => client().api.templates[':id'].$get({ param: { id } }));

export const fetchDocuments = (limit?: number) =>
  call<DocumentList>(() => client().api.documents.$get({ query: limit ? { limit: String(limit) } : {} }));

export const renameDocument = (id: string, title: string) =>
  call<OfficeDocument>(() => client().api.documents[':id'].$patch({ param: { id }, json: { title } }));

export const fetchDocument = (id: string) =>
  call<OfficeDocument>(() => client().api.documents[':id'].$get({ param: { id } }));

export const fetchDocumentContent = (id: string) =>
  call<EditorContent>(() => client().api.documents[':id'].content.$get({ param: { id } }));

export const fetchSlides = (id: string) =>
  call<Deck>(() => client().api.documents[':id'].slides.$get({ param: { id } }));

export const saveSlides = (id: string, edits: SlideEdits) =>
  call<OfficeDocument>(() => client().api.documents[':id'].slides.$put({ param: { id }, json: edits }));

export const duplicateSlide = (id: string, index: number) =>
  call<Deck>(() => client().api.documents[':id'].slides[':index'].duplicate.$post({ param: { id, index: String(index) } }));

export const deleteSlide = (id: string, index: number) =>
  call<Deck>(() => client().api.documents[':id'].slides[':index'].$delete({ param: { id, index: String(index) } }));

export const createDocumentFromTemplate = (templateId: string) =>
  call<{ id: string }>(() => client().api.templates[':id'].use.$post({ param: { id: templateId } }));

export const saveDocumentContent = (id: string, input: UpdateDocumentInput) =>
  call<OfficeDocument>(() => client().api.documents[':id'].content.$put({ param: { id }, json: input }));

export async function uploadTemplate(form: FormData, adminToken: string): Promise<Template> {
  return call<Template>(() =>
    fetch('/api/admin/templates', { method: 'POST', body: form, headers: { 'x-admin-token': adminToken } }),
  );
}
