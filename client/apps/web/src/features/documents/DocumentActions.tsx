import { Link, useRouter } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { OfficeDocument } from '@office-template/server/contracts';
import { Button, buttonClass, Spinner } from '#/components/ui';
import { ApiClientError, deleteDocument } from '#/lib/api';

/**
 * Confirmation modal. A native <dialog> gives the focus trap, Escape to close and an inert page
 * behind it. It is mounted only while open and, like the template preview, has no cleanup that calls
 * close() (React's dev-mode double effect run would close it right away).
 */
function ConfirmDelete({
  document,
  deleting,
  error,
  onConfirm,
  onClose,
}: {
  document: OfficeDocument;
  deleting: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="delete-title"
      aria-describedby="delete-description"
      onClose={onClose}
      // Not while the request is running: the dialog would vanish before its outcome is known.
      onCancel={(event) => deleting && event.preventDefault()}
      // A click on the backdrop lands on the <dialog> element itself.
      onClick={(event) => event.target === event.currentTarget && !deleting && dialog.current?.close()}
      className="w-[min(26rem,calc(100vw-2rem))] rounded-xl p-6 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm"
    >
      <h2 id="delete-title" className="text-lg font-semibold text-slate-900">
        Delete this file?
      </h2>
      <p id="delete-description" className="mt-2 text-sm text-slate-600">
        “{document.title}” will be permanently deleted. This cannot be undone.
      </p>
      {error ? (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" autoFocus disabled={deleting} onClick={() => dialog.current?.close()}>
          Cancel
        </Button>
        <Button
          disabled={deleting}
          aria-busy={deleting}
          onClick={onConfirm}
          className="bg-red-600 text-white hover:bg-red-700"
        >
          {deleting ? <Spinner /> : null}
          Delete
        </Button>
      </div>
    </dialog>
  );
}

/**
 * Open / Download / Delete for one file. Delete opens a confirmation modal; deleting is permanent, so
 * after it succeeds every loader is refreshed and the card (and the sidebar entry) is gone.
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
        onClick={() => {
          setError(undefined);
          setState('confirm');
        }}
        className="ml-auto size-10 text-slate-500 hover:text-red-600"
      >
        <Trash2 aria-hidden className="size-[18px]" />
      </Button>
      {state !== 'idle' ? (
        <ConfirmDelete
          document={document}
          deleting={state === 'deleting'}
          error={error}
          onConfirm={() => void remove()}
          onClose={() => setState('idle')}
        />
      ) : null}
    </div>
  );
}
