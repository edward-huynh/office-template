import { Button, Spinner, type ButtonVariant } from '#/components/ui';
import { useCreateDocument } from './use-create-document';

/** The interactive piece of a template card: makes a copy and opens it. */
export function UseTemplateButton({
  templateId,
  variant = 'primary',
  label = 'Use template',
}: {
  templateId: string;
  variant?: ButtonVariant;
  label?: string;
}) {
  const { create, pending, error } = useCreateDocument(templateId);
  return (
    <div>
      <Button variant={variant} onClick={create} disabled={pending} aria-busy={pending}>
        {pending ? <Spinner /> : null}
        {pending ? 'Creating…' : label}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
