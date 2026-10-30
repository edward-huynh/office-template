import { createFileRoute } from '@tanstack/react-router';
import { DocumentsPage } from '#/features/documents/DocumentsPage';
import { fetchDocuments } from '#/lib/api';

export const Route = createFileRoute('/documents/')({
  // Per-visitor data: the loader runs on the server with the visitor's cookie forwarded.
  loader: () => fetchDocuments(),
  head: () => ({ meta: [{ title: 'My files · Template Library' }] }),
  component: () => <DocumentsPage data={Route.useLoaderData()} />,
});
