import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Template } from '@office-template/server/contracts';
import { Icon } from '#/components/icons';
import { Badge, TypeMark } from '#/components/ui';
import { typeLabel } from '#/lib/format';
import { UseTemplateButton } from './UseTemplateButton';

/** "Open full page" keeps each template reachable at its own shareable URL. */
function FullPageLink({ template }: { template: Template }) {
  const className = 'inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline';
  const content = (
    <>
      Open full page <Icon name="arrow" size={16} />
    </>
  );
  return template.type === 'docx' ? (
    <Link to="/docx/$templateId" params={{ templateId: template.id }} className={className}>
      {content}
    </Link>
  ) : (
    <Link to="/pptx/$templateId" params={{ templateId: template.id }} className={className}>
      {content}
    </Link>
  );
}

/**
 * Quick look at a template without leaving the gallery. A native <dialog> gives focus trapping,
 * Escape to close and an inert page behind it. For decks, arrow keys move between slides.
 */
export function QuickPreview({ template, onClose }: { template: Template; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const isDeck = template.type === 'pptx';
  const total = template.previewUrls.length;

  // No cleanup that calls close(): React's dev-mode double effect run would fire the dialog's own
  // close event and unmount it. Removing the element from the DOM closes it by itself.
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  function onKeyDown(event: KeyboardEvent) {
    if (!isDeck) return;
    if (event.key === 'ArrowRight') setIndex((i) => Math.min(total - 1, i + 1));
    if (event.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="quick-preview-title"
      onClose={onClose}
      onKeyDown={onKeyDown}
      // A click on the backdrop lands on the <dialog> element itself.
      onClick={(event) => event.target === event.currentTarget && dialog.current?.close()}
      className="w-[min(1080px,calc(100vw-1.5rem))] overflow-hidden rounded-xl p-0 shadow-2xl backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm"
    >
      {/* The row must be capped at the grid's max-height (minmax(0,1fr)); with an auto row a long preview
          grows the row instead, nothing scrolls and the side panel's buttons are clipped. On a narrow
          screen the two stack and the whole modal scrolls. */}
      <div className="grid max-h-[calc(100dvh-1.5rem)] max-md:overflow-y-auto md:grid-cols-[1fr_21rem] md:grid-rows-[minmax(0,1fr)]">
        <div className="min-h-0 overflow-y-auto bg-gradient-to-br from-slate-100 to-slate-200 p-6">
          {isDeck ? (
            <div className="space-y-4">
              <img
                src={template.previewUrls[index]}
                alt={`${template.name}, slide ${index + 1} of ${total}`}
                width={960}
                height={540}
                className="block h-auto w-full rounded-xl bg-white ring-1 ring-black/10"
              />
              <ol aria-label="Slides" className="flex gap-2 overflow-x-auto pb-1">
                {template.previewUrls.map((url, i) => (
                  <li key={url} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-label={`Show slide ${i + 1}`}
                      aria-current={i === index}
                      className={`block w-28 overflow-hidden rounded-xl border-2 ${i === index ? 'border-brand-600' : 'border-transparent opacity-80 hover:opacity-100'}`}
                    >
                      <img src={url} alt="" width={960} height={540} loading="lazy" className="block h-auto w-full" />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <ol className="mx-auto max-w-md space-y-5">
              {template.previewUrls.map((url, i) => (
                <li key={url}>
                  <img
                    src={url}
                    alt={`${template.name}, page ${i + 1}`}
                    width={720}
                    height={932}
                    className="block h-auto w-full bg-white ring-1 ring-black/10"
                  />
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <TypeMark type={template.type} />
              <Badge>{template.category}</Badge>
            </div>
            <button
              type="button"
              aria-label="Close preview"
              onClick={() => dialog.current?.close()}
              className="grid size-8 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
          <div>
            <h2 id="quick-preview-title" className="text-2xl font-bold tracking-tight">
              {template.name}
            </h2>
            <p className="mt-2 text-slate-600">{template.description}</p>
          </div>
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-slate-500">Format</dt>
            <dd className="font-medium">{typeLabel[template.type]} (.{template.type})</dd>
            <dt className="text-slate-500">{isDeck ? 'Slides' : 'Pages'}</dt>
            <dd className="font-medium">{total}</dd>
            <dt className="text-slate-500">Version</dt>
            <dd className="font-medium">{template.version}</dd>
          </dl>
          <div className="mt-auto space-y-3 pt-2">
            <UseTemplateButton templateId={template.id} label="Use this template" />
            <FullPageLink template={template} />
            <p className="text-xs text-slate-500">Using a template creates your own copy. The original is never changed.</p>
          </div>
        </div>
      </div>
    </dialog>
  );
}
