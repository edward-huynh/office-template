import { Hydrate } from '@tanstack/react-start';
import { never } from '@tanstack/react-start/hydration';
import { Link } from '@tanstack/react-router';
import { Icon, type IconName } from './icons';

const activeClass = 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200';
const idleClass = 'text-slate-600 hover:bg-white/70 hover:text-slate-900';
const itemClass = 'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors';

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-2 text-[17px] font-bold tracking-tight text-slate-900">
      <span aria-hidden className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm text-white shadow-sm">
        T
      </span>
      Template Library
    </Link>
  );
}

function NavItem({ to, icon, label, exact }: { to: '/' | '/docx' | '/pptx' | '/documents' | '/admin/templates'; icon: IconName; label: string; exact?: boolean }) {
  return (
    <Link to={to} activeOptions={{ exact }} className={`${itemClass} ${idleClass}`} activeProps={{ className: `${itemClass} ${activeClass}` }}>
      <Icon name={icon} />
      {label}
    </Link>
  );
}

/** Left navigation on large screens; a compact top bar with scrollable pills on small ones. */
export function Sidebar() {
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r border-slate-200 bg-slate-50 px-4 py-6 lg:flex">
        <Brand />
        <nav aria-label="Main" className="flex flex-col gap-1">
          <NavItem to="/" exact icon="grid" label="All templates" />
          <NavItem to="/docx" icon="doc" label="Documents" />
          <NavItem to="/pptx" icon="slides" label="Presentations" />
          <p className="mt-5 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Yours</p>
          <NavItem to="/documents" icon="folder" label="My files" />
        </nav>
        <div className="mt-auto">
          <NavItem to="/admin/templates" icon="plus" label="Add a template" />
        </div>
      </aside>

      <header className="border-b border-slate-200 bg-slate-50 px-4 py-3 lg:hidden">
        <Brand />
        <nav aria-label="Main" className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          <NavItem to="/" exact icon="grid" label="All" />
          <NavItem to="/docx" icon="doc" label="Documents" />
          <NavItem to="/pptx" icon="slides" label="Presentations" />
          <NavItem to="/documents" icon="folder" label="My files" />
        </nav>
      </header>
    </>
  );
}

function FooterContent() {
  return (
    <footer className="border-t border-slate-200">
      <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-slate-500 sm:px-8">
        Templates are copied when you use them, so the originals are never changed. Your files belong to this browser
        session.
      </div>
    </footer>
  );
}

/** Pure static markup: rendered on the server and never hydrated, so it adds no client JavaScript. */
export function Footer() {
  return (
    <Hydrate when={never()}>
      <FooterContent />
    </Hydrate>
  );
}
