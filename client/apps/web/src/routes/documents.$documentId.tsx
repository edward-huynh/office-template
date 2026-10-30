import { createFileRoute, notFound } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { NotFoundView, PageSkeleton } from '#/components/states';
import { ApiClientError, fetchDocument, fetchDocumentContent, fetchSlides } from '#/lib/api';

// The editors are the heaviest code on the site, so each lives in its own chunk and loads only
// for the matching document type.
const DocxEditor = lazy(() => import('#/features/documents/DocxEditor'));
const PptxEditor = lazy(() => import('#/features/documents/PptxEditor'));

export const Route = createFileRoute('/documents/$documentId')({
  // Never cached: not by the router (it would keep the loader result and show it again on back/forward
  // or after a hover preload) and not by the browser. The document changes whenever it is saved.
  staleTime: 0,
  gcTime: 0,
  preloadStaleTime: 0,
  preloadGcTime: 0,
  headers: () => ({ 'Cache-Control': 'no-store' }),
  // The editors need the browser. The loader still runs on the server, so the content is ready
  // when the editor mounts.
  ssr: 'data-only',
  loader: async ({ params }) => {
    try {
      const document = await fetchDocument(params.documentId);
      if (document.type === 'pptx') return { kind: 'pptx' as const, document, deck: await fetchSlides(document.id) };
      const content = await fetchDocumentContent(document.id);
      return { kind: 'docx' as const, document, html: content.html, defaults: content.defaults };
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.document.title ?? 'Document'} · Template Library` }],
  }),
  notFoundComponent: () => <NotFoundView what="document" />,
  component: DocumentView,
});

function DocumentView() {
  const data = Route.useLoaderData();
  return (
    <Suspense fallback={<PageSkeleton />}>
      {data.kind === 'pptx' ? (
        <PptxEditor key={data.document.id} doc={data.document} initialDeck={data.deck} />
      ) : (
        <DocxEditor key={data.document.id} document={data.document} initialHtml={data.html} defaults={data.defaults} />
      )}
    </Suspense>
  );
}
