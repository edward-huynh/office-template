import type { Template } from '@office-template/server/contracts';
import { Icon } from '#/components/icons';
import { Badge, TypeMark } from '#/components/ui';
import { typeLabel } from '#/lib/format';
import { LibraryLink } from './links';
import { UseTemplateButton } from './UseTemplateButton';

/** Static page or slide images. */
function PreviewImages({ template }: { template: Template }) {
  const isDeck = template.type === 'pptx';
  return (
    <ol className={isDeck ? 'grid gap-4 sm:grid-cols-2' : 'mx-auto max-w-2xl space-y-6'}>
      {template.previewUrls.map((url, index) => (
        <li key={url} className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200/70">
          <img
            src={url}
            alt={`${template.name}, ${isDeck ? 'slide' : 'page'} ${index + 1}`}
            width={isDeck ? 960 : 720}
            height={isDeck ? 540 : 932}
            loading={index === 0 ? 'eager' : 'lazy'}
            fetchPriority={index === 0 ? 'high' : 'auto'}
            decoding="async"
            className="block h-auto w-full"
          />
          <p className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-500">
            {isDeck ? 'Slide' : 'Page'} {index + 1} of {template.previewUrls.length}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function TemplatePreview({ template }: { template: Template }) {
  const noun = template.type === 'pptx' ? 'slides' : 'pages';
  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
        <LibraryLink type={template.type} search={{}} className="inline-flex items-center gap-1 hover:text-brand-700">
          <span aria-hidden>←</span> All {typeLabel[template.type].toLowerCase()} templates
        </LibraryLink>
      </nav>
      <div className="grid gap-8 lg:grid-cols-[1fr_21rem]">
        {/*
          Not wrapped in <Hydrate when={never()}>: that boundary keeps only the server HTML of the
          first page load, so after a client-side navigation it rendered nothing.
        */}
        <div className={`rounded-xl bg-gradient-to-br p-6 ${template.type === 'pptx' ? 'from-orange-50 to-rose-100' : 'from-sky-50 to-blue-100'}`}>
          <PreviewImages template={template} />
        </div>
        <aside className="h-fit space-y-4 rounded-xl border border-slate-200 bg-white p-6 lg:sticky lg:top-6">
          <div className="flex items-center gap-2">
            <TypeMark type={template.type} />
            <Badge>{template.category}</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{template.name}</h1>
          <p className="text-slate-600">{template.description}</p>
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-slate-500">Format</dt>
            <dd className="font-medium">{template.type.toUpperCase()}</dd>
            <dt className="text-slate-500">Preview</dt>
            <dd className="font-medium">
              {template.previewUrls.length} {noun}
            </dd>
            <dt className="text-slate-500">Version</dt>
            <dd className="font-medium">{template.version}</dd>
          </dl>
          <UseTemplateButton templateId={template.id} label="Use this template" />
          <p className="flex gap-2 text-xs text-slate-500">
            <Icon name="eye" size={14} className="mt-0.5 shrink-0" />
            Using a template creates your own copy. The original template is never changed.
          </p>
        </aside>
      </div>
    </div>
  );
}
