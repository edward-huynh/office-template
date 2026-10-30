import { createFileRoute } from '@tanstack/react-router';
import { DocumentsPage } from '#/features/documents/DocumentsPage';
import { fetchDocuments } from '#/lib/api';

export const Route = createFileRoute('/documents/')({
  // Never cached: not by the router (it would keep the loader result and show it again on back/forward
  // or after a hover preload) and not by the browser. The document changes whenever it is saved.
  staleTime: 0,
  gcTime: 0,
  preloadStaleTime: 0,
  preloadGcTime: 0,
  headers: () => ({ 'Cache-Control': 'no-store' }),
  // Per-visitor data: the loader runs on the server with the visitor's cookie forwarded.
  loader: () => fetchDocuments(),
  head: () => ({ meta: [{ title: 'My files · Template Library' }] }),
  component: () => <DocumentsPage data={Route.useLoaderData()} />,
});
