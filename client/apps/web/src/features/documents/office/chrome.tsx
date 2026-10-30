import { Link } from '@tanstack/react-router';
import { useEffect, type ReactNode } from 'react';
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from '@/components/motion/combobox';
import { Input } from '@/components/motion/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/motion/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/motion/tabs';
import { Button } from '#/components/ui';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from './icons';

/**
 * Office-style application chrome shared by the Word and PowerPoint editors: a coloured title bar,
 * a tabbed ribbon with labelled groups, and a status bar. Controls are beUI components (Button,
 * Input, Tabs, Select, Combobox) restyled to fit the ribbon.
 */
export type OfficeApp = 'word' | 'powerpoint';

const THEME = {
  word: { bar: 'bg-[#2b579a]', accent: 'text-[#2b579a]', glyph: 'W', indicator: 'bg-[#2b579a]' },
  powerpoint: { bar: 'bg-[#b7472a]', accent: 'text-[#b7472a]', glyph: 'P', indicator: 'bg-[#b7472a]' },
} as const;

/** Full-window editor surface that sits above the app shell. */
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
      <Input
        id="doc-title"
        aria-label="Title"
        value={title}
        maxLength={120}
        onChange={onTitleChange}
        className="min-w-0 max-w-md flex-1"
        classNames={{
          field: 'h-8 rounded-md border-transparent bg-transparent hover:bg-white/10 focus-within:bg-white/20 focus-within:ring-white/40',
          input: 'pl-2 text-sm font-semibold text-white caret-white',
        }}
      />
      <span role="status" className={`hidden text-xs sm:inline ${status === 'error' ? 'font-semibold text-yellow-200' : 'text-white/80'}`}>
        {statusText}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onSave} disabled={status === 'saving' || status === 'saved'} className="text-white hover:bg-white/15 hover:text-white">
          <Icon name="save" /> Save
        </Button>
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
      <Tabs value={active.id} onValueChange={onActivate} variant="underline" className="bg-[#f3f3f3] px-2 pt-1">
        <TabsList aria-label="Ribbon" className="border-b-0">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              onMouseDown={(event) => event.preventDefault()}
              indicatorClassName={cn('h-0.5', theme.indicator)}
              className={cn('min-h-0 px-4 py-2 text-[13px]', tab.contextual && 'text-emerald-700 hover:text-emerald-800', active.id === tab.id && theme.accent)}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {/* Groups wrap instead of scrolling: an overflow container would clip the select lists. */}
      <div role="tabpanel" aria-label={active.label} className="flex min-h-[7.5rem] flex-wrap items-stretch gap-y-1 px-2 py-1.5">
        {active.content}
      </div>
    </div>
  );
}

export function RibbonGroup({ label, children }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 flex-col justify-between border-r border-slate-200 px-2 last:border-r-0">
      <div className="flex items-start gap-1">{children}</div>
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
    <Button
      variant="ghost"
      size="sm"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      pressScale={0.92}
      // Keep the text selection: clicking a ribbon button must not steal focus from the document.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        large ? 'h-14 w-14 flex-col gap-0.5 rounded-lg px-0 text-[12px]' : 'h-7 min-w-7 gap-1 rounded-md px-1.5 text-[13px]',
        'text-slate-800 hover:bg-slate-200/80 hover:text-slate-900 disabled:opacity-35',
        active && 'bg-primary/15 ring-1 ring-primary/40 hover:bg-primary/20',
      )}
    >
      {icon ? <Icon name={icon} size={large ? 22 : 16} /> : null}
      {text ? <span className={large ? '' : 'font-semibold'}>{text}</span> : null}
      {children}
    </Button>
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
    // Opening the list must not take focus (and the selection) away from the document.
    <div onMouseDown={(event) => event.preventDefault()}>
      <Select value={value} onValueChange={onChange} className={width}>
        <SelectTrigger aria-label={label} className="h-7 rounded-md px-2 py-0 text-[13px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-64 rounded-md">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Searchable list (used for the font family): type to filter, arrows and Enter to choose. */
export function RibbonCombobox({
  label,
  value,
  options,
  onChange,
  width = 'w-40',
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  width?: string;
}) {
  return (
    <div className={width}>
      <Combobox value={value} onValueChange={onChange}>
        <ComboboxTrigger className="h-7 min-w-0 gap-1 rounded-md px-2">
          <ComboboxInput aria-label={label} placeholder={label} className="h-7 text-[13px]" />
        </ComboboxTrigger>
        <ComboboxContent className="w-52 rounded-xl">
          <ComboboxList ariaLabel={`${label} list`} className="max-h-64 p-1">
            <ComboboxEmpty>No match.</ComboboxEmpty>
            {options.map((option) => (
              <ComboboxItem key={option.value} value={option.value} textValue={option.label}>
                <span style={{ fontFamily: option.value }}>{option.label}</span>
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
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
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => onChange(Math.max(min, value - 10))} className="size-5 rounded text-white hover:bg-white/20 hover:text-white">
        <Icon name="zoomOut" size={14} />
      </Button>
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
      <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => onChange(Math.min(max, value + 10))} className="size-5 rounded text-white hover:bg-white/20 hover:text-white">
        <Icon name="zoomIn" size={14} />
      </Button>
      <span className="w-10 text-right tabular-nums" aria-live="polite">
        {value}%
      </span>
    </div>
  );
}
