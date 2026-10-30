import { Link } from '@tanstack/react-router';
import type { DocumentList, OfficeDocument } from '@office-template/server/contracts';
import { EmptyState } from '#/components/states';
import { TypeMark } from '#/components/ui';
import { formatBytes, formatDate, typeLabel } from '#/lib/format';
import { DocumentActions } from './DocumentActions';
import { RenameTitle } from './RenameTitle';

function DocumentCard({ document }: { document: OfficeDocument }) {
  const deck = document.type === 'pptx';
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition ">
      <Link
        to="/documents/$documentId"
        params={{ documentId: document.id }}
        preload={false}
        aria-hidden
        tabIndex={-1}
        className={`flex aspect-[16/10] justify-center bg-gradient-to-br ${deck ? 'items-center from-orange-50 to-rose-100' : 'items-end from-sky-50 to-blue-100'}`}
      >
        <img
          src={document.thumbnailUrl}
          alt=""
          width={deck ? 480 : 480}
          height={deck ? 270 : 621}
          loading="lazy"
          className={`h-auto bg-white ${deck ? 'w-[84%] rounded-xl' : 'w-[62%] translate-y-3 rounded-t-sm'}`}
        />
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex items-center gap-2">
          <TypeMark type={document.type} />
          <RenameTitle id={document.id} title={document.title} />
        </div>
        <p className="text-xs text-slate-500">
          {typeLabel[document.type]} · Updated {formatDate(document.updatedAt)} · {formatBytes(document.sizeBytes)}
        </p>
        <DocumentActions document={document} />
      </div>
    </article>
  );
}

export function DocumentsPage({ data }: { data: DocumentList }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My files</h1>
        <p className="mt-2 text-slate-600">Documents and presentations you created in this browser session.</p>
      </div>
      {data.items.length === 0 ? (
        <EmptyState title="You have not created anything yet">
          Start from a{' '}
          <Link to="/docx" className="font-medium text-brand-700 underline">
            document
          </Link>{' '}
          or{' '}
          <Link to="/pptx" className="font-medium text-brand-700 underline">
            presentation
          </Link>{' '}
          template.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-6">
          {data.items.map((document) => (
            <li key={document.id} className="flex">
              <div className="w-full">
                <DocumentCard document={document} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
