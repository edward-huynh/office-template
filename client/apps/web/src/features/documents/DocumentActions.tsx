import { Link, useRouter } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { OfficeDocument } from '@office-template/server/contracts';
import { Button, buttonClass, Spinner } from '#/components/ui';
import { ApiClientError, deleteDocument } from '#/lib/api';

/**
 * Open / Download / Delete for one file. Delete asks first, in place (a two-step button, no browser
 * dialog): "Delete" turns the row into "Delete this file? Cancel / Delete". Deleting removes the file
 * for good, so after it succeeds every loader is refreshed and the card (and the sidebar entry) is gone.
 */
export function DocumentActions({ document }: { document: OfficeDocument }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'confirm' | 'deleting'>('idle');
  const [error, setError] = useState<string>();

  async function remove() {
    setState('deleting');
    setError(undefined);
    try {
      await deleteDocument(document.id);
      await router.invalidate();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Could not delete the file.');
      setState('confirm');
    }
  }

  if (state !== 'idle') {
    return (
      <div className="mt-auto space-y-2 pt-3">
        <p className="text-sm font-medium text-slate-900">Delete “{document.title}”? This cannot be undone.</p>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={state === 'deleting'} onClick={() => setState('idle')}>
            Cancel
          </Button>
          <Button
            disabled={state === 'deleting'}
            aria-busy={state === 'deleting'}
            onClick={() => void remove()}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {state === 'deleting' ? <Spinner /> : null}
            Delete
          </Button>
        </div>
        {error ? (
          <p role="alert" className="rounded-xl bg-red-50 px-2 py-1 text-xs text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-auto flex gap-2 pt-3">
      <Link to="/documents/$documentId" params={{ documentId: document.id }} className={buttonClass()}>
        Open
      </Link>
      <a href={document.downloadUrl} download className={buttonClass('secondary')}>
        Download
      </a>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Delete ${document.title}`}
        title="Delete"
        onClick={() => setState('confirm')}
        className="ml-auto size-10 text-slate-500 hover:text-red-600"
      >
        <Trash2 aria-hidden className="size-[18px]" />
      </Button>
    </div>
  );
}
