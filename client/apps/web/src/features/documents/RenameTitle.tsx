import { useRouter } from '@tanstack/react-router';
import { Pencil } from 'lucide-react';
import { useRef, useState } from 'react';
import { Input } from '@/components/motion/input';
import { ApiClientError, renameDocument } from '#/lib/api';

/**
 * Document name that turns into an input on click (or on the pencil): Enter or leaving the field
 * saves, Escape cancels. After saving, every loader is refreshed so My files and the sidebar agree.
 */
export function RenameTitle({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  const finished = useRef(false); // Enter/Escape are followed by a blur: only the first one counts

  async function commit(raw: string) {
    if (finished.current) return;
    finished.current = true;
    const next = raw.trim();
    if (!next || next === title) return setEditing(false);
    try {
      await renameDocument(id, next);
      await router.invalidate();
      setEditing(false);
    } catch (e) {
      finished.current = false;
      setError(e instanceof ApiClientError ? e.message : 'Could not rename the document.');
    }
  }

  if (!editing) {
    return (
      <div className="group flex min-w-0 flex-1 items-center gap-1">
        <h2 className="truncate text-[15px] font-semibold">{title}</h2>
        <button
          type="button"
          aria-label={`Rename ${title}`}
          title="Rename"
          onClick={() => {
            finished.current = false;
            setError(undefined);
            setEditing(true);
          }}
          className="grid size-7 shrink-0 place-items-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <Pencil aria-hidden className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1">
      <Input
        autoFocus
        aria-label="Document name"
        defaultValue={title}
        maxLength={120}
        error={error}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={(event) => void commit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void commit(event.currentTarget.value);
          if (event.key === 'Escape') {
            finished.current = true;
            setEditing(false);
          }
        }}
        classNames={{ field: 'h-8', input: 'text-sm font-semibold' }}
      />
    </div>
  );
}
