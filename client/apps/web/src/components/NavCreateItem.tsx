import { Link } from '@tanstack/react-router';
import { CirclePlus } from 'lucide-react';
import { useCreateDocument } from '#/features/templates/use-create-document';
import { Icon, type IconName } from './icons';
import { Spinner } from './ui';

/**
 * A navigation row with a plus-circle on its right: the row opens the library, the plus creates a
 * blank file of that kind (copy-on-use of the blank starter) and opens it in the editor. The plus is
 * a sibling of the link, not inside it, so there is no button nested in a link.
 */
export function NavCreateItem({
  to,
  icon,
  label,
  blankTemplateId,
  createLabel,
  className,
  activeClassName,
}: {
  to: '/docx' | '/pptx';
  icon: IconName;
  label: string;
  blankTemplateId: string;
  createLabel: string;
  className: string;
  activeClassName: string;
}) {
  const { create, pending, error } = useCreateDocument(blankTemplateId);
  return (
    <div>
      <div className="relative">
        <Link to={to} className={`${className} pr-11`} activeProps={{ className: `${activeClassName} pr-11` }}>
          <Icon name={icon} />
          {label}
        </Link>
        <button
          type="button"
          aria-label={createLabel}
          title={createLabel}
          disabled={pending}
          aria-busy={pending}
          onClick={() => void create()}
          className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-900/5 hover:text-primary disabled:cursor-wait"
        >
          {pending ? <Spinner /> : <CirclePlus aria-hidden className="size-[18px]" />}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-1 rounded-xl bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
