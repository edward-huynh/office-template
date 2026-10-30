import { createFileRoute } from '@tanstack/react-router';
import { LibrarySkeleton } from '#/components/states';
import { LibraryPage } from '#/features/templates/LibraryPage';
import { librarySearchSchema, loadHome } from '#/features/templates/library-route';

export const Route = createFileRoute('/')({
  validateSearch: librarySearchSchema,
  loaderDeps: ({ search }) => search,
  // Per-visitor data (recent files): the loader runs on the server with the visitor's cookie forwarded.
  loader: ({ deps }) => loadHome(deps),
  pendingComponent: LibrarySkeleton,
  head: () => ({ meta: [{ title: 'Template Library · Documents and presentations from templates' }] }),
  component: Home,
});

function Home() {
  const { templates, recent } = Route.useLoaderData();
  return <LibraryPage type="all" data={templates} search={Route.useSearch()} recent={recent} />;
}
