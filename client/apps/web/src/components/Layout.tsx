import { Hydrate } from '@tanstack/react-start';
import { never } from '@tanstack/react-start/hydration';
import { Link } from '@tanstack/react-router';
import { LazyMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import { LazyOmnibox } from './LazyOmnibox';

const itemClass = 'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors';
const idleClass = 'text-slate-600 hover:bg-white/60 hover:text-slate-900';
const activeClass = 'bg-white text-primary shadow-sm ring-1 ring-black/5';

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

/**
 * Left rail in the style of Dia: it sits directly on the tinted window background (no panel, no
 * divider) and holds an address-bar style search box above the navigation. On small screens it
 * becomes a compact top bar with scrollable pills.
 */
export function Sidebar() {
  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col gap-5 px-2 py-3 lg:flex">
        <Brand />
        <LazyOmnibox />
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

/**
 * Dia-style window: a tinted backdrop, the rail on it, and the page as one rounded floating panel
 * that scrolls on its own. The panel (not the window) is the scroll container.
 */
const loadMotionFeatures = () => import('#/lib/motion-features').then((module) => module.default);

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
    <div className="app-backdrop flex h-dvh flex-col overflow-hidden lg:flex-row lg:p-2 lg:pl-0">
      <Sidebar />
      <div
        id="main-panel"
        data-scroll-restoration-id="main"
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-white lg:rounded-2xl lg:shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_10px_40px_-8px_rgba(15,23,42,0.18)]"
      >
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
        <Footer />
      </div>
    </div>
    </LazyMotion>
  );
}
