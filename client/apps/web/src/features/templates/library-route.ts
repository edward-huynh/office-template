import { notFound } from '@tanstack/react-router';
import { librarySearchSchema, type DocType, type LibrarySearch } from '@office-template/server/contracts';
import { ApiClientError, fetchDocuments, fetchTemplate, fetchTemplates, requestOrigin } from '#/lib/api';
import type { GalleryType } from './links';

export { librarySearchSchema };

/** Shared loader for `/`, `/docx` and `/pptx`: the URL search params fully determine the data. */
export const loadLibrary = (type: GalleryType, search: LibrarySearch) =>
  fetchTemplates({ type: type === 'all' ? undefined : type, ...search });

/** Home page data: the gallery plus the visitor's recent files (a failure there must not break the page). */
export async function loadHome(search: LibrarySearch) {
  const [templates, recent] = await Promise.all([
    loadLibrary('all', search),
    fetchDocuments().then((list) => list.items.slice(0, 4)).catch(() => []),
  ]);
  return { templates, recent };
}

/** Loader for a template preview page. A missing template becomes a real 404. */
export async function loadTemplatePreview(type: DocType, id: string) {
  try {
    const template = await fetchTemplate(id);
    if (template.type !== type) throw notFound();
    return { template, origin: requestOrigin() };
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) throw notFound();
    throw error;
  }
}
