import { useNavigate } from '@tanstack/react-router';
import type { LibrarySearch, OfficeDocument, Template, TemplateList } from '@office-template/server/contracts';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '#/components/icons';
import { EmptyState } from '#/components/states';
import { buttonClass } from '#/components/ui';
import { BlankTiles } from './BlankTiles';
import { LibraryLink, type GalleryType } from './links';
import { QuickPreview } from './QuickPreview';
import { RecentFiles } from './RecentFiles';
import { TemplateCard } from './TemplateCard';

const COPY: Record<GalleryType, { title: string; lead: string }> = {
  all: { title: 'Start from a template', lead: 'Beautifully designed documents and presentations, ready to make your own in a few clicks.' },
  docx: { title: 'Document templates', lead: 'Letters, reports, invoices and more. Edit in a Word-style editor, then download a DOCX.' },
  pptx: { title: 'Presentation templates', lead: 'Designed slide decks for pitches, reviews and lessons. Edit the slides, present, download a PPTX.' },
};

/**
 * Search box. Works without JavaScript (a plain GET form that reloads the page with `?q=`); once
 * hydrated it updates the URL as you type and the route loader refetches.
 */
function SearchBar({ type, search }: { type: GalleryType; search: LibrarySearch }) {
  const navigate = useNavigate();
  // Uncontrolled on purpose: text typed before the page finished hydrating must not be wiped.
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const go = (q: string, replace: boolean) => {
    const next = { q: q.trim() || undefined, category: search.category, page: undefined };
    if (type === 'all') return navigate({ to: '/', search: next, replace });
    return type === 'docx'
      ? navigate({ to: '/docx', search: next, replace })
      : navigate({ to: '/pptx', search: next, replace });
  };

  const schedule = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const value = input.current?.value ?? '';
      if (value.trim() !== (search.q ?? '')) void go(value, true);
    }, 350);
  };

  // Typed before hydration: pick it up now.
  useEffect(() => {
    if (input.current && input.current.value.trim() !== (search.q ?? '')) schedule();
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The URL changed from elsewhere (Clear filters, back button): reflect it unless the user is typing.
  useEffect(() => {
    const el = input.current;
    if (el && window.document.activeElement !== el) el.value = search.q ?? '';
  }, [search.q]);

  return (
    <form
      role="search"
      method="get"
      action={type === 'all' ? '/' : `/${type}`}
      onSubmit={(event) => {
        event.preventDefault();
        clearTimeout(timer.current);
        void go(input.current?.value ?? '', false);
      }}
      className="flex w-full max-w-2xl items-center gap-2 rounded-full bg-white p-1.5 pl-5 shadow-lg shadow-indigo-900/20"
    >
      {search.category ? <input type="hidden" name="category" value={search.category} /> : null}
      <Icon name="search" className="shrink-0 text-slate-400" />
      <label className="sr-only" htmlFor="template-search">
        Search templates
      </label>
      <input
        ref={input}
        id="template-search"
        name="q"
        type="search"
        defaultValue={search.q ?? ''}
        onChange={schedule}
        placeholder="Search templates, e.g. invoice, pitch, resume"
        className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
      />
      <button type="submit" className={buttonClass()}>
        Search
      </button>
    </form>
  );
}

function TypeTabs({ type, search }: { type: GalleryType; search: LibrarySearch }) {
  const tab = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200/70'}`;
  const q = { q: search.q };
  return (
    <nav aria-label="Template type" className="inline-flex gap-1 rounded-full bg-slate-100 p-1">
      <LibraryLink type="all" search={q} className={tab(type === 'all')} aria-current={type === 'all' ? 'page' : undefined}>
        All
      </LibraryLink>
      <LibraryLink type="docx" search={q} className={tab(type === 'docx')} aria-current={type === 'docx' ? 'page' : undefined}>
        Documents
      </LibraryLink>
      <LibraryLink type="pptx" search={q} className={tab(type === 'pptx')} aria-current={type === 'pptx' ? 'page' : undefined}>
        Presentations
      </LibraryLink>
    </nav>
  );
}

function CategoryFilter({ type, categories, search }: { type: GalleryType; categories: string[]; search: LibrarySearch }) {
  const chip = (active: boolean) =>
    `rounded-full border px-3.5 py-1 text-sm font-medium transition-colors ${
      active ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
    }`;
  return (
    <nav aria-label="Categories" className="flex flex-wrap gap-2">
      <LibraryLink type={type} search={{ q: search.q }} className={chip(!search.category)} aria-current={!search.category ? 'page' : undefined}>
        All
      </LibraryLink>
      {categories.map((category) => (
        <LibraryLink
          key={category}
          type={type}
          search={{ q: search.q, category }}
          className={chip(search.category === category)}
          aria-current={search.category === category ? 'page' : undefined}
        >
          {category}
        </LibraryLink>
      ))}
    </nav>
  );
}

function Pagination({ type, data, search }: { type: GalleryType; data: TemplateList; search: LibrarySearch }) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  if (pages <= 1) return null;
  const link = (page: number) => ({ q: search.q, category: search.category, page });
  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-4 text-sm">
      {data.page > 1 ? (
        <LibraryLink type={type} search={link(data.page - 1)} className={buttonClass('secondary')}>
          Previous
        </LibraryLink>
      ) : null}
      <span className="text-slate-600">
        Page {data.page} of {pages}
      </span>
      {data.page < pages ? (
        <LibraryLink type={type} search={link(data.page + 1)} className={buttonClass('secondary')}>
          Next
        </LibraryLink>
      ) : null}
    </nav>
  );
}

export function LibraryPage({
  type,
  data,
  search,
  recent = [],
}: {
  type: GalleryType;
  data: TemplateList;
  search: LibrarySearch;
  recent?: OfficeDocument[];
}) {
  const [quick, setQuick] = useState<Template | null>(null);
  const filtered = Boolean(search.q || search.category);
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 px-6 py-10 text-white sm:px-10 sm:py-12">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 right-40 size-64 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="relative space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{COPY[type].title}</h1>
            <p className="max-w-xl text-indigo-100">{COPY[type].lead}</p>
          </div>
          <SearchBar type={type} search={search} />
        </div>
      </section>

      {filtered ? null : <BlankTiles type={type} />}

      {type === 'all' && !filtered ? <RecentFiles items={recent} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <TypeTabs type={type} search={search} />
        <p className="text-sm text-slate-500" aria-live="polite">
          {data.total} {data.total === 1 ? 'template' : 'templates'}
        </p>
      </div>
      <CategoryFilter type={type} categories={data.categories} search={search} />

      {data.items.length === 0 ? (
        <EmptyState title="No templates match your search">
          {filtered ? (
            <LibraryLink type={type} search={{}} className="font-medium text-brand-700 underline">
              Clear filters
            </LibraryLink>
          ) : (
            'No templates have been added yet.'
          )}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(15.5rem,1fr))] gap-x-6 gap-y-9">
          {data.items.map((template, index) => (
            <li key={template.id} className="flex">
              <TemplateCard template={template} priority={index < 4} onQuickPreview={setQuick} />
            </li>
          ))}
        </ul>
      )}
      <Pagination type={type} data={data} search={search} />

      {quick ? <QuickPreview key={quick.id} template={quick} onClose={() => setQuick(null)} /> : null}
    </div>
  );
}
