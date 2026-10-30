import { lazy, Suspense, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sidebarControl } from './ui';

const CommandSearch = lazy(() => import('./CommandSearch'));

/**
 * The sidebar's search box. It looks like a field but is a button that opens the command palette
 * (beUI), so the palette and its animation code load only when needed: on idle, when the pointer
 * or keyboard reaches for the box, or on Cmd/Ctrl+K, which this component handles itself until
 * the palette has loaded and then hands over to the palette's own shortcut.
 */
export function SidebarSearch() {
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [mac, setMac] = useState(false);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const load = () => setLoaded(true);
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(load, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(load, 1500);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (loaded) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setLoaded(true);
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loaded]);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        onPointerEnter={() => setLoaded(true)}
        onFocus={() => setLoaded(true)}
        className={cn(sidebarControl, 'flex w-full cursor-pointer items-center gap-2 px-3 text-left font-normal')}
      >
        <Search aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Search or jump to…</span>
        <kbd className="font-sans text-xs text-slate-600">
          {mac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>
      {loaded ? (
        <Suspense fallback={null}>
          <CommandSearch open={open} onOpenChange={setOpen} />
        </Suspense>
      ) : null}
    </>
  );
}
