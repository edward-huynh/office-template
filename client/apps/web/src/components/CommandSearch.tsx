import { useRouter } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import type { DocType, OfficeDocument, Template } from '@office-template/server/contracts';
import { CommandPalette, type CommandItem } from '@/components/motion/command-palette';
import { fetchDocuments, fetchTemplates } from '#/lib/api';
import { TypeMark } from './ui';

const TYPE_WORDS: Record<DocType, string[]> = {
  docx: ['document', 'word', 'docx'],
  pptx: ['presentation', 'slides', 'powerpoint', 'pptx'],
};

type Data = { templates: Template[]; files: OfficeDocument[] };

/**
 * Command palette (beUI) over everything the visitor can open: their own files and every template.
 * The palette filters locally, so the lists are fetched each time it opens (a file created or
 * renamed a minute ago is there) and cover the API's page limits: 50 templates, 100 files.
 */
export default function CommandSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [data, setData] = useState<Data>();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      fetchTemplates({ pageSize: 50 }).catch(() => undefined),
      fetchDocuments(100).catch(() => undefined),
    ]).then(([templates, files]) => {
      if (!cancelled) setData({ templates: templates?.items ?? [], files: files?.items ?? [] });
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const items = useMemo<CommandItem[]>(() => {
    if (!data) return [];
    const files = data.files.map((file): CommandItem => ({
      id: `file:${file.id}`,
      label: file.title,
      group: 'My files',
      keywords: ['file', ...TYPE_WORDS[file.type]],
      badge: <TypeMark type={file.type} />,
      onSelect: () => void router.navigate({ to: '/documents/$documentId', params: { documentId: file.id } }),
    }));
    const templates = data.templates.map((template): CommandItem => ({
      id: `template:${template.id}`,
      label: template.name,
      group: 'Templates',
      keywords: [template.category, template.description, ...TYPE_WORDS[template.type]],
      badge: <TypeMark type={template.type} />,
      onSelect: () =>
        void (template.type === 'docx'
          ? router.navigate({ to: '/docx/$templateId', params: { templateId: template.id } })
          : router.navigate({ to: '/pptx/$templateId', params: { templateId: template.id } })),
    }));
    return [...files, ...templates];
  }, [data, router]);

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      items={items}
      placeholder="Search templates and your files…"
      emptyMessage={data ? 'Nothing matches your search.' : 'Loading…'}
    />
  );
}
