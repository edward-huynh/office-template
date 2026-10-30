import { Link } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';

/**
 * Office-style application chrome shared by the Word and PowerPoint editors: a coloured title bar,
 * a tabbed ribbon with labelled groups, and a status bar.
 */
export type OfficeApp = 'word' | 'powerpoint';

const THEME = {
  word: { bar: 'bg-[#2b579a]', accent: 'text-[#2b579a]', accentBorder: 'border-[#2b579a]', ring: 'ring-[#2b579a]', glyph: 'W', name: 'Word', soft: 'bg-[#cfdcf0]' },
  powerpoint: { bar: 'bg-[#b7472a]', accent: 'text-[#b7472a]', accentBorder: 'border-[#b7472a]', ring: 'ring-[#b7472a]', glyph: 'P', name: 'PowerPoint', soft: 'bg-[#f7d9d0]' },
} as const;

/** Full-window editor surface that sits above the site header. */
export function EditorShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return <div className="fixed inset-0 z-50 flex flex-col bg-[#e6e6e6] text-slate-900">{children}</div>;
}

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

export function TitleBar({
  app,
  title,
  onTitleChange,
  status,
  onSave,
  actions,
}: {
  app: OfficeApp;
  title: string;
  onTitleChange: (value: string) => void;
  status: SaveState;
  onSave: () => void;
  actions?: ReactNode;
}) {
  const theme = THEME[app];
  const statusText = { saved: 'Saved', dirty: 'Unsaved changes', saving: 'Saving…', error: 'Save failed' }[status];
  return (
    <header className={`flex items-center gap-3 px-3 py-1.5 text-white ${theme.bar}`}>
      <Link to="/documents" aria-label="Back to my files" title="Back to my files" className="grid size-8 place-items-center rounded hover:bg-white/15">
        <Icon name="back" />
      </Link>
      <span aria-hidden className="grid size-7 place-items-center rounded-sm bg-white text-sm font-black" style={{ color: app === 'word' ? '#2b579a' : '#b7472a' }}>
        {theme.glyph}
      </span>
      <label className="sr-only" htmlFor="doc-title">
        Title
      </label>
      <input
        id="doc-title"
        value={title}
        maxLength={120}
        onChange={(event) => onTitleChange(event.target.value)}
        className="min-w-0 max-w-md flex-1 rounded bg-transparent px-2 py-1 text-sm font-semibold text-white outline-none hover:bg-white/10 focus:bg-white/20"
      />
      <span role="status" className={`hidden text-xs sm:inline ${status === 'error' ? 'font-semibold text-yellow-200' : 'text-white/80'}`}>
        {statusText}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onSave}
          disabled={status === 'saving' || status === 'saved'}
          className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-50"
        >
          <Icon name="save" /> Save
        </button>
        {actions}
      </div>
    </header>
  );
}

export interface RibbonTabSpec {
  id: string;
  label: string;
  /** Contextual tabs (such as Word's Table tab) are tinted. */
  contextual?: boolean;
  content: ReactNode;
}

export function Ribbon({ app, tabs, activeId, onActivate }: { app: OfficeApp; tabs: RibbonTabSpec[]; activeId: string; onActivate: (id: string) => void }) {
  const theme = THEME[app];
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0]!;
  return (
    <div className="border-b border-slate-300 bg-white">
      <div role="tablist" aria-label="Ribbon" className="flex gap-0.5 bg-[#f3f3f3] px-2 pt-1">
        {tabs.map((tab) => {
          const selected = tab.id === active.id;
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={selected}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onActivate(tab.id)}
              className={`rounded-t px-4 py-1.5 text-[13px] ${
                selected
                  ? `border border-b-0 border-slate-300 bg-white font-semibold ${theme.accent}`
                  : `border border-transparent text-slate-700 hover:bg-slate-200/70 ${tab.contextual ? 'text-emerald-700' : ''}`
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" aria-label={active.label} className="flex min-h-[5.75rem] items-stretch gap-0 overflow-x-auto px-2 py-1.5">
        {active.content}
      </div>
    </div>
  );
}

export function RibbonGroup({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 flex-col justify-between border-r border-slate-200 px-2 last:border-r-0">
      <div className={`flex items-start gap-1 ${wide ? 'flex-wrap' : ''}`}>{children}</div>
      <p className="mt-1 text-center text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

/** A row of controls inside a group (ribbons stack two or three rows). */
export function RibbonRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

export function RibbonStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1">{children}</div>;
}

export function RibbonButton({
  label,
  icon,
  text,
  onClick,
  active,
  disabled,
  large,
  children,
}: {
  label: string;
  icon?: IconName;
  text?: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  large?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the text selection: clicking a ribbon button must not steal focus from the document.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex items-center justify-center gap-1 rounded text-[13px] disabled:opacity-35 ${
        large ? 'h-14 w-14 flex-col text-[12px]' : 'h-7 min-w-7 px-1.5'
      } ${active ? 'bg-[#cfdcf0] text-slate-900 ring-1 ring-slate-400' : 'text-slate-800 hover:bg-slate-200/80'}`}
    >
      {icon ? <Icon name={icon} size={large ? 22 : 16} /> : null}
      {text ? <span className={large ? '' : 'font-semibold'}>{text}</span> : null}
      {children}
    </button>
  );
}

export function RibbonSelect({
  label,
  value,
  options,
  onChange,
  width = 'w-32',
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  width?: string;
}) {
  return (
    <select
      aria-label={label}
      title={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`h-7 rounded border border-slate-300 bg-white px-1 text-[13px] ${width}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Colour button: a letter or glyph over a colour bar, backed by a native colour input. */
export function RibbonColor({ label, value, onChange, glyph, glyphClass }: { label: string; value: string; onChange: (hex: string) => void; glyph: string; glyphClass?: string }) {
  return (
    <label
      title={label}
      className="relative flex h-7 w-8 cursor-pointer flex-col items-center justify-center rounded hover:bg-slate-200/80"
      onMouseDown={(event) => event.preventDefault()}
    >
      <span className={`text-[13px] font-bold leading-none ${glyphClass ?? ''}`}>{glyph}</span>
      <span aria-hidden className="mt-0.5 h-[3px] w-5 rounded-sm" style={{ background: value }} />
      <input
        type="color"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

export function StatusBar({ app, left, right }: { app: OfficeApp; left: ReactNode; right: ReactNode }) {
  return (
    <footer className={`flex items-center justify-between gap-4 px-3 py-1 text-xs text-white ${THEME[app].bar}`}>
      <div className="flex items-center gap-4">{left}</div>
      <div className="flex items-center gap-3">{right}</div>
    </footer>
  );
}

/** Zoom slider shown in the status bar. */
export function ZoomControl({ value, onChange, min = 50, max = 200 }: { value: number; onChange: (value: number) => void; min?: number; max?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label="Zoom out" onClick={() => onChange(Math.max(min, value - 10))} className="grid size-5 place-items-center rounded hover:bg-white/20">
        <Icon name="zoomOut" size={14} />
      </button>
      <input
        type="range"
        aria-label="Zoom"
        min={min}
        max={max}
        step={5}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 w-28 accent-white"
      />
      <button type="button" aria-label="Zoom in" onClick={() => onChange(Math.min(max, value + 10))} className="grid size-5 place-items-center rounded hover:bg-white/20">
        <Icon name="zoomIn" size={14} />
      </button>
      <span className="w-10 text-right tabular-nums" aria-live="polite">
        {text}%
      </span>
    </div>
  );
}
