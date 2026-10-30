import { Link } from '@tanstack/react-router';
import type { OfficeDocument } from '@office-template/server/contracts';
import { Icon } from '#/components/icons';
import { TypeMark } from '#/components/ui';
import { formatDate } from '#/lib/format';

/** "Continue where you left off": the visitor's most recent files. Rendered only when there are any. */
export function RecentFiles({ items }: { items: OfficeDocument[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="recent-title" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="recent-title" className="flex items-center gap-2 text-lg font-semibold">
          <Icon name="clock" size={18} className="text-slate-400" /> Continue where you left off
        </h2>
        <Link to="/documents" className="text-sm font-medium text-brand-700 hover:underline">
          All files
        </Link>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((doc) => (
          <li key={doc.id}>
            <Link
              to="/documents/$documentId"
              params={{ documentId: doc.id }}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-slate-300 hover:shadow-md"
            >
              <img
                src={doc.thumbnailUrl}
                alt=""
                width={56}
                height={doc.type === 'pptx' ? 32 : 72}
                loading="lazy"
                className="h-14 w-14 shrink-0 rounded-lg bg-slate-100 object-cover object-top ring-1 ring-slate-200"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <TypeMark type={doc.type} />
                  <span className="truncate text-sm font-semibold">{doc.title}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">Edited {formatDate(doc.updatedAt)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
