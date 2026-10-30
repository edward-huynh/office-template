/// <reference types="vite/client" />
import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { AppShell, RECENT_LIMIT } from '#/components/Layout';
import { fetchDocuments } from '#/lib/api';
import appCss from '../styles.css?url';

export const Route = createRootRoute({
  // The sidebar's "Recent" list. Per visitor, so it loads with the visitor's cookie; a failure here must
  // never break the page, the list is just left empty.
  loader: () => fetchDocuments(RECENT_LIMIT).catch(() => ({ items: [] })),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Template Library' },
      { name: 'description', content: 'Start from a template: create Word documents and PowerPoint presentations in seconds.' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%234f46e5'/%3E%3Ctext x='16' y='23' font-size='20' font-family='Arial' font-weight='700' text-anchor='middle' fill='white'%3ET%3C/text%3E%3C/svg%3E",
      },
    ],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
});

function RootComponent() {
  return (
    <AppShell recents={Route.useLoaderData().items}>
      <Outlet />
    </AppShell>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
