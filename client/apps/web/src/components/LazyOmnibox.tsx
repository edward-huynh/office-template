import { lazy, Suspense, useEffect, useState } from 'react';
import { Search } from 'lucide-react';

const Omnibox = lazy(() => import('./Omnibox'));

/** Looks like the omnibox before it loads, so the layout does not move when the real one arrives. */
function Shell({ onActivate }: { onActivate?: () => void }) {
  return (
    <div className="flex h-10 items-center gap-2 rounded-xl border border-transparent bg-white/70 px-3 text-sm ">
      <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <input
        readOnly
        aria-label="Search templates"
        placeholder="Search or jump to…"
        onFocus={onActivate}
        onPointerEnter={onActivate}
        className="h-10 min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-600"
      />
    </div>
  );
}

/**
 * The omnibox (a beUI Combobox with async results) is not needed for the first paint, so its code
 * is loaded when the browser is idle, or earlier if the user reaches for it. Until then a static
 * look-alike holds its place.
 */
export function LazyOmnibox() {
  const [active, setActive] = useState<'idle' | 'idle-loaded' | 'user'>('idle');

  useEffect(() => {
    const load = () => setActive((current) => (current === 'idle' ? 'idle-loaded' : current));
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(load, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(load, 1500);
    return () => clearTimeout(id);
  }, []);

  if (active === 'idle') return <Shell onActivate={() => setActive('user')} />;
  return (
    <Suspense fallback={<Shell />}>
      <Omnibox autoFocus={active === 'user'} />
    </Suspense>
  );
}
