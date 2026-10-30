import { useCreateDocument } from '#/features/templates/use-create-document';
import { Button, sidebarControl, Spinner } from './ui';

const ACTIONS = [
  { templateId: 'blank-document', label: 'Document', name: 'New blank document', glyph: 'W', color: 'bg-[#2b579a]' },
  { templateId: 'blank-presentation', label: 'Slides', name: 'New blank presentation', glyph: 'P', color: 'bg-[#c43e1c]' },
] as const;

function QuickAction({ action }: { action: (typeof ACTIONS)[number] }) {
  const { create, pending, error } = useCreateDocument(action.templateId);
  return (
    <>
      <Button
        variant="ghost"
        aria-label={action.name}
        title={action.name}
        disabled={pending}
        aria-busy={pending}
        onClick={() => void create()}
        className={`${sidebarControl} min-w-0 gap-1.5 px-2`}
      >
        {pending ? (
          <Spinner />
        ) : (
          <span
            aria-hidden
            className={`grid size-5 shrink-0 place-items-center rounded-md text-[10px] font-black text-white ${action.color}`}
          >
            {action.glyph}
          </span>
        )}
        <span className="truncate">{action.label}</span>
      </Button>
      {error ? (
        <p role="alert" className="col-span-2 rounded-xl bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </>
  );
}

/** One click to a blank file: copy-on-use of the blank starters, then straight into the editor. */
export function QuickActions() {
  return (
    <div role="group" aria-label="Quick actions" className="grid grid-cols-2 gap-2">
      {ACTIONS.map((action) => (
        <QuickAction key={action.templateId} action={action} />
      ))}
    </div>
  );
}
