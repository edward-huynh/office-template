import { Link, useRouter } from '@tanstack/react-router';
import { ApiClientError } from '#/lib/api';
import { Button, buttonClass } from './ui';

/** Skeleton shown by routes while their loader runs during client-side navigation. */
export function LibrarySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading templates" className="space-y-8">
      <div className="h-52 animate-pulse rounded-xl bg-indigo-100" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(15.5rem,1fr))] gap-x-6 gap-y-9">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-[5/4] rounded-xl bg-slate-200" />
            <div className="mt-3 space-y-2 px-1">
              <div className="h-4 w-2/3 rounded bg-slate-200" />
              <div className="h-3 w-1/3 rounded bg-slate-100" />
              <div className="h-3 w-full rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" className="animate-pulse space-y-4">
      <div className="h-8 w-1/3 rounded bg-slate-200" />
      <div className="h-64 rounded-xl bg-slate-200" />
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="text-lg font-semibold text-slate-800">{title}</p>
      {children ? <div className="mt-2 text-slate-600">{children}</div> : null}
    </div>
  );
}

/** Error boundary content with a retry that re-runs the route loader. */
export function ErrorView({ error }: { error: unknown }) {
  const router = useRouter();
  const message =
    error instanceof ApiClientError ? error.message : 'Something went wrong while loading this page.';
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 text-center">
      <p className="text-lg font-semibold text-red-900">We could not load this page</p>
      <p className="mt-2 text-red-800">{message}</p>
      <div className="mt-6 flex justify-center gap-3">
        <Button onClick={() => router.invalidate()}>Try again</Button>
        <Link to="/" className={buttonClass('secondary')}>
          Home
        </Link>
      </div>
    </div>
  );
}

export function NotFoundView({ what = 'page' }: { what?: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-center">
      <p className="text-5xl font-bold text-slate-300">404</p>
      <p className="mt-3 text-lg font-semibold">{`We could not find that ${what}`}</p>
      <p className="mt-1 text-slate-600">It may have been removed, or the link is incorrect.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link to="/docx" className={buttonClass()}>
          Browse documents
        </Link>
        <Link to="/pptx" className={buttonClass('secondary')}>
          Browse presentations
        </Link>
      </div>
    </div>
  );
}
