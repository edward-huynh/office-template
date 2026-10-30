import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { ErrorView, NotFoundView, PageSkeleton } from '#/components/states';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    // The page scrolls inside the floating panel, not the window.
    scrollToTopSelectors: ['#main-panel'],
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 30_000,
    // Show the skeleton only when a navigation is actually slow, to avoid flashes.
    defaultPendingMs: 200,
    defaultPendingMinMs: 300,
    defaultPendingComponent: PageSkeleton,
    defaultErrorComponent: ({ error }) => <ErrorView error={error} />,
    defaultNotFoundComponent: () => <NotFoundView />,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
