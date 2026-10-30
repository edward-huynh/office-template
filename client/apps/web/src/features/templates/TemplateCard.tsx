import type { Template } from '@office-template/server/contracts';
import { buttonClass, TypeMark } from '#/components/ui';
import { typeLabel } from '#/lib/format';
import { PreviewLink } from './links';
import { UseTemplateButton } from './UseTemplateButton';

/**
 * DOCX thumbnails are portrait pages shown like a sheet of paper peeking out of the frame; PPTX
 * thumbnails are 16:9 slides shown whole. Each type has its own soft backdrop.
 */
const FRAME = {
  docx: {
    backdrop: 'from-sky-50 to-blue-100',
    image: 'w-[74%] translate-y-4 rounded-t-sm ring-1 ring-black/10 group-hover:translate-y-2',
    layout: 'items-end',
    width: 480,
    height: 621,
  },
  pptx: {
    backdrop: 'from-orange-50 to-rose-100',
    image: 'w-[88%] rounded-xl ring-1 ring-black/10 group-hover:scale-[1.03]',
    layout: 'items-center',
    width: 480,
    height: 270,
  },
} as const;

export function TemplateCard({
  template,
  priority,
  onQuickPreview,
}: {
  template: Template;
  priority: boolean;
  onQuickPreview: (template: Template) => void;
}) {
  const frame = FRAME[template.type];
  const open = () => onQuickPreview(template);
  return (
    <article className="group flex w-full flex-col">
      <div className={`relative aspect-[5/4] overflow-hidden rounded-xl bg-gradient-to-br ${frame.backdrop} ring-1 ring-slate-200/80 transition duration-300 group-hover:-translate-y-0.5 `}>
        <PreviewLink type={template.type} id={template.id} onOpen={open} hidden className={`flex h-full w-full justify-center ${frame.layout}`}>
          <img
            src={template.thumbnailUrl}
            alt={`Preview of ${template.name}`}
            width={frame.width}
            height={frame.height}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            className={`h-auto bg-white transition duration-300 ${frame.image}`}
          />
        </PreviewLink>
        <span className="pointer-events-none absolute left-3 top-3">
          <TypeMark type={template.type} />
        </span>
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-gradient-to-t from-slate-900/75 via-slate-900/40 to-transparent p-3 pt-10 opacity-100 transition duration-200 lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
          <UseTemplateButton templateId={template.id} variant="light" />
          <PreviewLink type={template.type} id={template.id} onOpen={open} className={buttonClass('glass')}>
            Preview
          </PreviewLink>
        </div>
      </div>
      <div className="mt-3 px-1">
        <h3 className="truncate text-[15px] font-semibold text-slate-900">
          <PreviewLink type={template.type} id={template.id} onOpen={open} className="hover:text-brand-700">
            {template.name}
          </PreviewLink>
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {template.category} · {typeLabel[template.type]}
        </p>
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-slate-600">{template.description}</p>
      </div>
    </article>
  );
}
