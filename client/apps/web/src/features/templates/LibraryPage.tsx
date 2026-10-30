import { useNavigate } from '@tanstack/react-router';
import type { LibrarySearch, OfficeDocument, Template, TemplateList } from '@office-template/server/contracts';
import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/motion/tabs';
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

/** Document type switch. A beUI segmented control: it needs JavaScript to switch (the lists themselves are server-rendered). */
function TypeTabs({ type, search }: { type: GalleryType; search: LibrarySearch }) {
  const navigate = useNavigate();
  const q = { q: search.q };
  const go = (next: string) => {
    if (next === 'all') void navigate({ to: '/', search: q });
    else if (next === 'docx') void navigate({ to: '/docx', search: q });
    else void navigate({ to: '/pptx', search: q });
  };
  return (
    <>
      <Tabs value={type} onValueChange={go} variant="segment">
        <TabsList aria-label="Template type">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="docx">Documents</TabsTrigger>
          <TabsTrigger value="pptx">Presentations</TabsTrigger>
        </TabsList>
      </Tabs>
      <noscript>
        <nav aria-label="Template type (without JavaScript)" className="flex gap-3 text-sm">
          <LibraryLink type="all" search={q}>
            All
          </LibraryLink>
          <LibraryLink type="docx" search={q}>
            Documents
          </LibraryLink>
          <LibraryLink type="pptx" search={q}>
            Presentations
          </LibraryLink>
        </nav>
      </noscript>
    </>
  );
}

function CategoryFilter({ type, categories, search }: { type: GalleryType; categories: string[]; search: LibrarySearch }) {
  const chip = (active: boolean) =>
    `rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors ${
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
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-800 to-emerald-700 p-6 text-white sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 right-40 size-64 rounded-full bg-lime-300/15 blur-3xl" />
        <div className="relative space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{COPY[type].title}</h1>
            <p className="text-emerald-100">{COPY[type].lead}</p>
          </div>
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
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(15.5rem,1fr))] gap-6">
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
