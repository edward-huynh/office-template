import { useRouter } from '@tanstack/react-router';
import { FilePlus2, Presentation } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Template } from '@office-template/server/contracts';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from '@/components/motion/combobox';
import { ApiClientError, createDocumentFromTemplate } from '#/lib/api';
import { TypeMark } from './ui';

const ACTIONS = [
  { value: 'new:blank-document', label: 'New blank document', icon: FilePlus2 },
  { value: 'new:blank-presentation', label: 'New blank presentation', icon: Presentation },
] as const;

/**
 * Address-bar style command box: type to find a template and jump to it, or pick a quick action
 * with an empty box. Results come from the API (debounced, aborted when the text changes), so the
 * combobox's own filtering is switched off.
 */
export default function Omnibox({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<{ query: string; items: Template[] }>({ query: '', items: [] });
  const [error, setError] = useState<string>();

  const text = query.trim();
  useEffect(() => {
    if (!text) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/templates?q=${encodeURIComponent(text)}&pageSize=6`, { signal: controller.signal });
        const body = (await response.json()) as { data: { items: Template[] } };
        setResults({ query: text, items: body.data.items });
      } catch {
        /* aborted by a newer keystroke, or offline: keep the previous results */
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text]);

  const settled = results.query === text; // false while the request for the current text is in flight
  const items = text ? results.items : [];

  async function choose(value: string) {
    setError(undefined);
    setQuery('');
    setOpen(false);
    if (value.startsWith('new:')) {
      try {
        const { id } = await createDocumentFromTemplate(value.slice(4));
        await router.navigate({ to: '/documents/$documentId', params: { documentId: id } });
      } catch (e) {
        setError(e instanceof ApiClientError ? e.message : 'Could not create the document.');
      }
      return;
    }
    const template = results.items.find((item) => item.id === value);
    if (!template) return;
    await (template.type === 'docx'
      ? router.navigate({ to: '/docx/$templateId', params: { templateId: template.id } })
      : router.navigate({ to: '/pptx/$templateId', params: { templateId: template.id } }));
  }

  return (
    <div>
      <Combobox
        value=""
        onValueChange={(value) => void choose(value)}
        query={query}
        onQueryChange={setQuery}
        open={open}
        onOpenChange={setOpen}
        filter={() => true}
      >
        <ComboboxTrigger className="h-10 rounded-xl border-transparent bg-white/70 shadow-sm">
          <ComboboxInput aria-label="Search templates" placeholder="Search or jump to…" autoFocus={autoFocus} />
        </ComboboxTrigger>
        <ComboboxContent className="w-72 rounded-2xl">
          <ComboboxList ariaLabel="Templates and actions" className="p-2">
            {text ? (
              <>
                {settled && items.length === 0 ? <ComboboxEmpty>No templates match “{text}”.</ComboboxEmpty> : null}
                {!settled && items.length === 0 ? <ComboboxEmpty>Searching…</ComboboxEmpty> : null}
                <ComboboxGroup>
                  {items.map((item) => (
                    <ComboboxItem key={item.id} value={item.id} textValue={item.name} keywords={[item.category]}>
                      <span className="flex items-center gap-2">
                        <TypeMark type={item.type} />
                        <span className="truncate">{item.name}</span>
                      </span>
                    </ComboboxItem>
                  ))}
                </ComboboxGroup>
              </>
            ) : (
              <ComboboxGroup>
                <ComboboxLabel>Quick actions</ComboboxLabel>
                {ACTIONS.map(({ value, label, icon: Icon }) => (
                  <ComboboxItem key={value} value={value} textValue={label}>
                    <span className="flex items-center gap-2">
                      <Icon className="size-4 text-muted-foreground" />
                      {label}
                    </span>
                  </ComboboxItem>
                ))}
              </ComboboxGroup>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {error ? (
        <p role="alert" className="mt-1.5 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
