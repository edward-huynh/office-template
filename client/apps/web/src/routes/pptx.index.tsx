import { createFileRoute } from '@tanstack/react-router';
import { LibrarySkeleton } from '#/components/states';
import { LibraryPage } from '#/features/templates/LibraryPage';
import { librarySearchSchema, loadLibrary } from '#/features/templates/library-route';

export const Route = createFileRoute('/pptx/')({
  validateSearch: librarySearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => loadLibrary('pptx', deps),
  pendingComponent: LibrarySkeleton,
  head: () => ({ meta: [{ title: 'Presentation templates · Template Library' }] }),
  component: PptxLibrary,
});

function PptxLibrary() {
  return <LibraryPage type="pptx" data={Route.useLoaderData()} search={Route.useSearch()} />;
}
