import { Hydrate } from '@tanstack/react-start';
import { never } from '@tanstack/react-start/hydration';
import { Link } from '@tanstack/react-router';
import { LazyMotion } from 'motion/react';
import type { ReactNode } from 'react';
import type { OfficeDocument } from '@office-template/server/contracts';
import { Icon, type IconName } from './icons';
import { QuickActions } from './QuickActions';
import { SidebarSearch } from './SidebarSearch';
import { TypeMark } from './ui';

/** How many of the visitor's latest files the sidebar lists (the root loader asks for exactly this many). */
export const RECENT_LIMIT = 20;

const itemClass = 'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors';
const idleClass = 'text-slate-600 hover:bg-white/60 hover:text-slate-900';
const activeClass = 'bg-white text-primary ring-1 ring-black/5';

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 text-[17px] font-bold tracking-tight text-slate-900">
      <span aria-hidden className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-sm text-white ">
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

/** The visitor's latest files; the list scrolls inside the rail, so the rail itself never grows. */
function RecentList({ items }: { items: OfficeDocument[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="recent-nav-title" className="flex min-h-0 flex-1 flex-col">
      <p id="recent-nav-title" className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
        Recent
      </p>
      <ul className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1">
        {items.slice(0, RECENT_LIMIT).map((doc) => (
          <li key={doc.id}>
            <Link
              to="/documents/$documentId"
              params={{ documentId: doc.id }}
              title={doc.title}
              className={`${itemClass} ${idleClass} gap-2.5 py-1.5`}
            >
              <TypeMark type={doc.type} />
              <span className="truncate">{doc.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Left rail in the style of Dia: it sits directly on the tinted window background (no panel, no
 * divider) and holds an address-bar style search box above the navigation. On small screens it
 * becomes a compact top bar with scrollable pills.
 */
export function Sidebar({ recents }: { recents: OfficeDocument[] }) {
  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col gap-5 p-3 lg:flex">
        <Brand />
        <div className="space-y-2">
          <SidebarSearch />
          <QuickActions />
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          <NavItem to="/" exact icon="grid" label="All templates" />
          <NavItem to="/docx" icon="doc" label="Documents" />
          <NavItem to="/pptx" icon="slides" label="Presentations" />
          <p className="mt-5 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Yours</p>
          <NavItem to="/documents" icon="folder" label="My files" />
        </nav>
        <RecentList items={recents} />
        <div className="mt-auto shrink-0">
          <NavItem to="/admin/templates" icon="plus" label="Add a template" />
        </div>
      </aside>

      <header className="shrink-0 px-4 py-3 lg:hidden">
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
    <footer className="border-t border-slate-100">
      <div className="px-4 py-5 text-sm text-slate-500 sm:px-6">
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

/**
 * Dia-style window: a tinted backdrop, the rail on it, and the page as one rounded-xl floating panel
 * that scrolls on its own. The panel (not the window) is the scroll container.
 */
const loadMotionFeatures = () => import('#/lib/motion-features').then((module) => module.default);

export function AppShell({ children, recents }: { children: ReactNode; recents: OfficeDocument[] }) {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
    <div className="app-backdrop flex h-dvh flex-col overflow-hidden lg:flex-row lg:p-2 lg:pl-0">
      <Sidebar recents={recents} />
      <div
        id="main-panel"
        data-scroll-restoration-id="main"
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-white lg:rounded-xl lg:border lg:border-slate-200/70 "
      >
        <main className="w-full flex-1 p-4 sm:p-6">{children}</main>
        <Footer />
      </div>
    </div>
    </LazyMotion>
  );
}
