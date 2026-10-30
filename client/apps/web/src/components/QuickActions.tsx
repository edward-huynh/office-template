import { FilePlus2, Presentation } from 'lucide-react';
import { useCreateDocument } from '#/features/templates/use-create-document';
import { Button, Spinner } from './ui';

function QuickAction({ templateId, label, name, icon: Icon }: { templateId: string; label: string; name: string; icon: typeof FilePlus2 }) {
  const { create, pending, error } = useCreateDocument(templateId);
  return (
    <>
      <Button variant="light" size="sm" aria-label={name} disabled={pending} aria-busy={pending} onClick={() => void create()}>
        {pending ? <Spinner /> : <Icon aria-hidden className="size-4" />}
        {label}
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
      <QuickAction templateId="blank-document" label="Document" name="New blank document" icon={FilePlus2} />
      <QuickAction templateId="blank-presentation" label="Slides" name="New blank presentation" icon={Presentation} />
    </div>
  );
}
