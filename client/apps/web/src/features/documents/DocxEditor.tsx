import { TextStyleKit } from '@tiptap/extension-text-style';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { OfficeDocument } from '@office-template/server/contracts';
import { ApiClientError, saveDocumentContent } from '#/lib/api';
import {
  EditorShell,
  Ribbon,
  RibbonButton,
  RibbonColor,
  RibbonGroup,
  RibbonRow,
  RibbonCombobox,
  RibbonSelect,
  RibbonStack,
  StatusBar,
  TitleBar,
  ZoomControl,
  type RibbonTabSpec,
  type SaveState,
} from './office/chrome';
import { Icon } from './office/icons';

const FONTS = ['Calibri', 'Arial', 'Times New Roman', 'Georgia', 'Verdana', 'Courier New', 'Cambria', 'Trebuchet MS'];
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
const PAGE = { width: 816, height: 1056, margin: 96 } as const; // US Letter at 96 dpi, 1-inch margins

const pt = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const n = parseFloat(value);
  return value.endsWith('px') ? Math.round(n * 0.75 * 10) / 10 : n;
};

/** `rgb(1, 2, 3)` or `#abc` → `#rrggbb` (what `<input type="color">` requires). */
function toHex(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  if (rgb) return `#${[rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  return fallback;
}

function Ruler({ zoomKey }: { zoomKey: number }) {
  const ticks: React.ReactNode[] = [];
  for (let x = 0; x <= PAGE.width - 2 * PAGE.margin; x += 12) {
    const inch = x % 96 === 0;
    const half = x % 48 === 0;
    ticks.push(
      <line key={x} x1={PAGE.margin + x + 0.5} x2={PAGE.margin + x + 0.5} y1={inch ? 4 : half ? 7 : 9} y2={13} stroke="#777" strokeWidth="1" />,
      inch && x > 0 ? (
        <text key={`t${x}`} x={PAGE.margin + x} y={10} fontSize="9" textAnchor="middle" fill="#555">
          {x / 96}
        </text>
      ) : null,
    );
  }
  return (
    <svg key={zoomKey} role="img" aria-label="Ruler" width={PAGE.width} height={18} className="block bg-white">
      <rect x={0} y={0} width={PAGE.margin} height={18} fill="#d9d9d9" />
      <rect x={PAGE.width - PAGE.margin} y={0} width={PAGE.margin} height={18} fill="#d9d9d9" />
      {ticks}
    </svg>
  );
}

function TableGrid({ onInsert }: { onInsert: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState<[number, number]>([0, 0]);
  return (
    <div onMouseLeave={() => setHover([0, 0])} className="flex flex-col gap-1">
      <div role="grid" aria-label="Insert table" className="grid grid-cols-8 gap-[2px]">
        {Array.from({ length: 5 * 8 }, (_, i) => {
          const row = Math.floor(i / 8) + 1;
          const col = (i % 8) + 1;
          const on = row <= hover[0] && col <= hover[1];
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              aria-label={`${row} by ${col} table`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHover([row, col])}
              onClick={() => onInsert(row, col)}
              className={`size-3 border ${on ? 'border-[#2b579a] bg-[#cfdcf0]' : 'border-slate-400 bg-white'}`}
            />
          );
        })}
      </div>
      <p className="text-center text-[11px] text-slate-500" aria-live="polite">
        {hover[0] ? `${hover[1]} × ${hover[0]} table` : 'Insert table'}
      </p>
    </div>
  );
}

function useToolbarState(editor: Editor | null, defaults: { fontFamily?: string; fontSize?: number }) {
  return useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;
      const style = e.getAttributes('textStyle') as { fontFamily?: string; fontSize?: string; color?: string; backgroundColor?: string };
      return {
        fontFamily: (style.fontFamily ?? defaults.fontFamily ?? 'Calibri').replace(/["']/g, '').split(',')[0]!.trim(),
        fontSize: pt(style.fontSize) ?? defaults.fontSize ?? 11,
        color: toHex(style.color, '#000000'),
        background: toHex(style.backgroundColor, '#ffff00'),
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        bullet: e.isActive('bulletList'),
        ordered: e.isActive('orderedList'),
        inList: e.isActive('listItem'),
        h1: e.isActive('heading', { level: 1 }),
        h2: e.isActive('heading', { level: 2 }),
        h3: e.isActive('heading', { level: 3 }),
        quote: e.isActive('blockquote'),
        left: e.isActive({ textAlign: 'left' }),
        center: e.isActive({ textAlign: 'center' }),
        right: e.isActive({ textAlign: 'right' }),
        justify: e.isActive({ textAlign: 'justify' }),
        inTable: e.isActive('table'),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  });
}

const STYLE_TILES = [
  { id: 'normal', label: 'Normal', className: 'text-[13px]' },
  { id: 'h1', label: 'Heading 1', className: 'text-[15px] font-bold text-[#2b579a]' },
  { id: 'h2', label: 'Heading 2', className: 'text-[14px] font-bold text-[#2b579a]' },
  { id: 'h3', label: 'Heading 3', className: 'text-[13px] font-semibold text-[#1f3864]' },
  { id: 'quote', label: 'Quote', className: 'text-[13px] italic text-slate-600' },
] as const;

/**
 * Word-style DOCX editor: title bar, tabbed ribbon (Home, Insert, View and a contextual Table tab),
 * a paper-like page on a grey canvas with a ruler, and a status bar with page count, word count and
 * zoom. Loaded lazily; content round-trips through the API as sanitized HTML.
 */
export default function DocxEditor({
  document,
  initialHtml,
  defaults = {},
}: {
  document: OfficeDocument;
  initialHtml: string;
  defaults?: { fontFamily?: string; fontSize?: number };
}) {
  const [title, setTitle] = useState(document.title);
  const [status, setStatus] = useState<SaveState>('saved');
  const [message, setMessage] = useState<string>();
  const [tab, setTab] = useState('home');
  const [zoom, setZoom] = useState(100);
  const [ruler, setRuler] = useState(true);
  const [words, setWords] = useState(0);
  const [pages, setPages] = useState({ count: 1, current: 1 });
  const saved = useRef({ html: initialHtml, title: document.title });
  const sheetRef = useRef<HTMLDivElement>(null);

  const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextStyleKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table,
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: initialHtml,
    immediatelyRender: false,
    editorProps: { attributes: { class: 'doc-surface', 'aria-label': 'Document content', role: 'textbox', 'aria-multiline': 'true' } },
    onCreate: ({ editor: e }) => setWords(countWords(e.getText())),
    onUpdate: ({ editor: e }) => {
      setStatus((current) => (current === 'saving' ? current : 'dirty'));
      setWords(countWords(e.getText()));
    },
  });

  const state = useToolbarState(editor, defaults);

  // Page count (content height / page height) and the page the caret is on.
  const measure = useCallback(() => {
    const sheet = sheetRef.current;
    const body = sheet?.querySelector<HTMLElement>('.ProseMirror');
    if (!sheet || !body || !editor) return;
    const scale = zoom / 100;
    const count = Math.max(1, Math.ceil((body.scrollHeight - PAGE.margin) / (PAGE.height - PAGE.margin * 2 + PAGE.margin)));
    let current = 1;
    try {
      const caret = editor.view.coordsAtPos(editor.state.selection.from);
      current = Math.min(count, Math.max(1, Math.floor((caret.top - sheet.getBoundingClientRect().top) / scale / PAGE.height) + 1));
    } catch {
      /* selection not rendered yet */
    }
    setPages((previous) => (previous.count === count && previous.current === current ? previous : { count, current }));
  }, [editor, zoom]);

  useEffect(() => {
    if (!editor) return;
    const body = sheetRef.current?.querySelector('.ProseMirror');
    if (!body) return;
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    editor.on('selectionUpdate', measure);
    editor.on('update', measure);
    measure();
    return () => {
      observer.disconnect();
      editor.off('selectionUpdate', measure);
      editor.off('update', measure);
    };
  }, [editor, measure]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!editor) return false;
    const html = editor.getHTML();
    if (html === saved.current.html && title === saved.current.title) {
      setStatus('saved');
      return true;
    }
    setStatus('saving');
    setMessage(undefined);
    try {
      await saveDocumentContent(document.id, { html, title: title.trim() || document.title });
      saved.current = { html, title };
      setStatus('saved');
      return true;
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof ApiClientError ? error.message : 'Could not save your changes.');
      return false;
    }
  }, [editor, title, document.id, document.title]);

  useEffect(() => {
    if (status !== 'dirty') return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  async function download() {
    if (await save()) window.location.assign(document.downloadUrl);
  }

  const chain = () => editor!.chain().focus();
  const stepSize = (direction: 1 | -1) => {
    const current = state?.fontSize ?? 11;
    const next = direction > 0 ? SIZES.find((s) => s > current) : [...SIZES].reverse().find((s) => s < current);
    if (next) chain().setFontSize(`${next}pt`).run();
  };

  const s = state;
  const homeTab: RibbonTabSpec = {
    id: 'home',
    label: 'Home',
    content: (
      <>
        <RibbonGroup label="Undo">
          <RibbonStack>
            <RibbonButton label="Undo" icon="undo" disabled={!s?.canUndo} onClick={() => chain().undo().run()} />
            <RibbonButton label="Redo" icon="redo" disabled={!s?.canRedo} onClick={() => chain().redo().run()} />
          </RibbonStack>
        </RibbonGroup>
        <RibbonGroup label="Font">
          <RibbonStack>
            <RibbonRow>
              <RibbonCombobox
                label="Font family"
                width="w-40"
                value={s?.fontFamily ?? 'Calibri'}
                options={[...new Set([s?.fontFamily ?? 'Calibri', ...FONTS])].map((f) => ({ value: f, label: f }))}
                onChange={(v) => chain().setFontFamily(v).run()}
              />
              <RibbonSelect
                label="Font size"
                width="w-16"
                value={String(s?.fontSize ?? 11)}
                options={[...new Set([s?.fontSize ?? 11, ...SIZES])].sort((a, b) => a - b).map((n) => ({ value: String(n), label: String(n) }))}
                onChange={(v) => chain().setFontSize(`${v}pt`).run()}
              />
              <RibbonButton label="Increase font size" icon="sizeUp" onClick={() => stepSize(1)} />
              <RibbonButton label="Decrease font size" icon="sizeDown" onClick={() => stepSize(-1)} />
            </RibbonRow>
            <RibbonRow>
              <RibbonButton label="Bold" text="B" active={s?.bold} onClick={() => chain().toggleBold().run()} />
              <RibbonButton label="Italic" active={s?.italic} onClick={() => chain().toggleItalic().run()}>
                <i className="font-serif font-semibold">I</i>
              </RibbonButton>
              <RibbonButton label="Underline" active={s?.underline} onClick={() => chain().toggleUnderline().run()}>
                <u className="font-semibold">U</u>
              </RibbonButton>
              <RibbonButton label="Strikethrough" active={s?.strike} onClick={() => chain().toggleStrike().run()}>
                <s className="font-semibold">S</s>
              </RibbonButton>
              <RibbonColor label="Highlight colour" value={s?.background ?? '#ffff00'} glyph="ab" glyphClass="bg-yellow-200 px-0.5" onChange={(hex) => chain().setBackgroundColor(hex).run()} />
              <RibbonColor label="Font colour" value={s?.color ?? '#000000'} glyph="A" onChange={(hex) => chain().setColor(hex).run()} />
            </RibbonRow>
          </RibbonStack>
        </RibbonGroup>
        <RibbonGroup label="Paragraph">
          <RibbonStack>
            <RibbonRow>
              <RibbonButton label="Bullets" icon="bullets" active={s?.bullet} onClick={() => chain().toggleBulletList().run()} />
              <RibbonButton label="Numbering" icon="numbered" active={s?.ordered} onClick={() => chain().toggleOrderedList().run()} />
              <RibbonButton label="Decrease indent" icon="outdent" disabled={!s?.inList} onClick={() => chain().liftListItem('listItem').run()} />
              <RibbonButton label="Increase indent" icon="indent" disabled={!s?.inList} onClick={() => chain().sinkListItem('listItem').run()} />
            </RibbonRow>
            <RibbonRow>
              <RibbonButton label="Align left" icon="alignLeft" active={s?.left} onClick={() => chain().setTextAlign('left').run()} />
              <RibbonButton label="Center" icon="alignCenter" active={s?.center} onClick={() => chain().setTextAlign('center').run()} />
              <RibbonButton label="Align right" icon="alignRight" active={s?.right} onClick={() => chain().setTextAlign('right').run()} />
              <RibbonButton label="Justify" icon="alignJustify" active={s?.justify} onClick={() => chain().setTextAlign('justify').run()} />
            </RibbonRow>
          </RibbonStack>
        </RibbonGroup>
        <RibbonGroup label="Styles">
          <div className="flex gap-1" role="list" aria-label="Styles">
            {STYLE_TILES.map((tile) => {
              const active = tile.id === 'h1' ? s?.h1 : tile.id === 'h2' ? s?.h2 : tile.id === 'h3' ? s?.h3 : tile.id === 'quote' ? s?.quote : !(s?.h1 || s?.h2 || s?.h3 || s?.quote);
              const apply = () => {
                if (tile.id === 'normal') chain().setParagraph().run();
                else if (tile.id === 'quote') chain().toggleBlockquote().run();
                else chain().toggleHeading({ level: Number(tile.id.slice(1)) as 1 | 2 | 3 }).run();
              };
              return (
                <button
                  key={tile.id}
                  type="button"
                  role="listitem"
                  aria-label={tile.label}
                  aria-pressed={active}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={apply}
                  className={`flex h-14 w-20 flex-col justify-center rounded border px-2 text-left ${active ? 'border-[#2b579a] bg-[#cfdcf0]' : 'border-slate-300 bg-white hover:bg-slate-100'}`}
                >
                  <span className={tile.className}>AaBbCc</span>
                  <span className="text-[10px] text-slate-500">{tile.label}</span>
                </button>
              );
            })}
          </div>
        </RibbonGroup>
      </>
    ),
  };

  const insertTab: RibbonTabSpec = {
    id: 'insert',
    label: 'Insert',
    content: (
      <>
        <RibbonGroup label="Tables">
          <TableGrid onInsert={(rows, cols) => chain().insertTable({ rows, cols, withHeaderRow: true }).run()} />
        </RibbonGroup>
        <RibbonGroup label="Links">
          <RibbonButton
            large
            label="Link"
            icon="link"
            text="Link"
            onClick={() => {
              const url = window.prompt('Link address (https://…)');
              if (url) chain().extendMarkRange('link').setLink({ href: url }).run();
            }}
          />
        </RibbonGroup>
        <RibbonGroup label="Illustrations">
          <RibbonButton large label="Horizontal line" icon="line" text="Line" onClick={() => chain().setHorizontalRule().run()} />
        </RibbonGroup>
      </>
    ),
  };

  const tableTab: RibbonTabSpec = {
    id: 'table',
    label: 'Table Layout',
    contextual: true,
    content: (
      <>
        <RibbonGroup label="Rows & Columns">
          <RibbonButton large label="Insert row above" icon="rowAbove" text="Above" onClick={() => chain().addRowBefore().run()} />
          <RibbonButton large label="Insert row below" icon="rowBelow" text="Below" onClick={() => chain().addRowAfter().run()} />
          <RibbonButton large label="Insert column left" icon="colLeft" text="Left" onClick={() => chain().addColumnBefore().run()} />
          <RibbonButton large label="Insert column right" icon="colRight" text="Right" onClick={() => chain().addColumnAfter().run()} />
          <RibbonStack>
            <RibbonButton label="Delete row" icon="trash" text="Row" onClick={() => chain().deleteRow().run()} />
            <RibbonButton label="Delete column" icon="trash" text="Column" onClick={() => chain().deleteColumn().run()} />
          </RibbonStack>
        </RibbonGroup>
        <RibbonGroup label="Merge">
          <RibbonButton large label="Merge or split cells" icon="merge" text="Merge" onClick={() => chain().mergeOrSplit().run()} />
        </RibbonGroup>
        <RibbonGroup label="Table">
          <RibbonStack>
            <RibbonButton label="Toggle header row" icon="table" text="Header row" onClick={() => chain().toggleHeaderRow().run()} />
            <RibbonButton label="Delete table" icon="trash" text="Delete table" onClick={() => chain().deleteTable().run()} />
          </RibbonStack>
        </RibbonGroup>
      </>
    ),
  };

  const viewTab: RibbonTabSpec = {
    id: 'view',
    label: 'View',
    content: (
      <>
        <RibbonGroup label="Zoom">
          <RibbonButton large label="Zoom in" icon="zoomIn" text="Zoom in" onClick={() => setZoom((z) => Math.min(200, z + 10))} />
          <RibbonButton large label="Zoom out" icon="zoomOut" text="Zoom out" onClick={() => setZoom((z) => Math.max(50, z - 10))} />
          <RibbonButton large label="Zoom to 100%" text="100%" onClick={() => setZoom(100)} />
        </RibbonGroup>
        <RibbonGroup label="Show">
          <label className="flex items-center gap-2 self-center px-2 text-[13px]">
            <input type="checkbox" checked={ruler} onChange={(event) => setRuler(event.target.checked)} /> Ruler
          </label>
        </RibbonGroup>
      </>
    ),
  };

  const tabs = [homeTab, insertTab, ...(s?.inTable ? [tableTab] : []), viewTab];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'home';

  return (
    <EditorShell>
      <TitleBar
        app="word"
        title={title}
        onTitleChange={(value) => {
          setTitle(value);
          setStatus('dirty');
        }}
        status={status}
        onSave={() => void save()}
        actions={
          <button type="button" onClick={() => void download()} disabled={status === 'saving'} className="flex items-center gap-1.5 rounded bg-white px-3 py-1.5 text-sm font-semibold text-[#2b579a] hover:bg-slate-100 disabled:opacity-60">
            <Icon name="download" /> Download DOCX
          </button>
        }
      />
      <Ribbon app="word" tabs={tabs} activeId={activeTab} onActivate={setTab} />
      {message ? (
        <p role="alert" className="bg-red-50 px-4 py-1.5 text-sm text-red-800">
          {message}
        </p>
      ) : null}

      <div className="flex-1 overflow-auto bg-[#e6e6e6]">
        <div className="mx-auto w-fit px-6 pt-3 pb-16" style={{ zoom: zoom / 100 }}>
          {ruler ? <Ruler zoomKey={zoom} /> : null}
          <div
            ref={sheetRef}
            data-testid="page"
            className="relative mt-1 bg-white shadow-[0_1px_6px_rgba(0,0,0,0.35)]"
            style={{
              width: PAGE.width,
              minHeight: pages.count * PAGE.height,
              fontFamily: `${defaults.fontFamily ?? 'Calibri'}, Carlito, "Segoe UI", Arial, sans-serif`,
              fontSize: `${defaults.fontSize ?? 11}pt`,
            }}
          >
            {Array.from({ length: pages.count - 1 }, (_, i) => (
              <div key={i} aria-hidden className="pointer-events-none absolute inset-x-0 z-10 h-3 border-y border-slate-300 bg-[#e6e6e6]" style={{ top: (i + 1) * PAGE.height - 6 }} />
            ))}
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      <StatusBar
        app="word"
        left={
          <>
            <span aria-live="polite">
              Page {pages.current} of {pages.count}
            </span>
            <span>{words} {words === 1 ? 'word' : 'words'}</span>
          </>
        }
        right={<ZoomControl value={zoom} onChange={setZoom} />}
      />
    </EditorShell>
  );
}
