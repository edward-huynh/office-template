import { createFileRoute } from '@tanstack/react-router';
import { LibrarySkeleton } from '#/components/states';
import { LibraryPage } from '#/features/templates/LibraryPage';
import { librarySearchSchema, loadLibrary } from '#/features/templates/library-route';

export const Route = createFileRoute('/docx/')({
  validateSearch: librarySearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => loadLibrary('docx', deps),
  pendingComponent: LibrarySkeleton,
  head: () => ({ meta: [{ title: 'Document templates · Template Library' }] }),
  component: DocxLibrary,
});

function DocxLibrary() {
  return <LibraryPage type="docx" data={Route.useLoaderData()} search={Route.useSearch()} />;
}
