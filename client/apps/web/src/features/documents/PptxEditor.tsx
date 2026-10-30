import { useCallback, useEffect, useRef, useState } from 'react';
import type { Deck, OfficeDocument, SlideParagraph } from '@office-template/server/contracts';
import { ApiClientError, deleteSlide, duplicateSlide, saveSlides } from '#/lib/api';
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
import { FLUSH_EVENT, SlideView } from './slides/SlideView';

const FONTS = ['Calibri', 'Arial', 'Times New Roman', 'Georgia', 'Verdana', 'Courier New', 'Cambria', 'Trebuchet MS', 'Segoe UI'];
const SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 60, 72, 96];
const PX_PER_PT = 96 / 72;
const THUMB_SCALE = 0.17;

interface Tools {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  font: string;
  size: number;
  color: string;
  bullet: boolean;
  align: 'left' | 'center' | 'right' | 'justify';
}

const DEFAULT_TOOLS: Tools = { bold: false, italic: false, underline: false, font: 'Calibri', size: 18, color: '#000000', bullet: false, align: 'left' };

const toHex = (rgb: string) => {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  return m ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : '#000000';
};

/** The editable text box the selection is currently in, if any. */
function editableOf(node: Node | null): HTMLElement | null {
  const el = node instanceof HTMLElement ? node : node?.parentElement;
  return el?.closest<HTMLElement>('[data-editable="true"]') ?? null;
}

/**
 * PowerPoint-style PPTX editor: slide thumbnails on the left, the slide on a grey canvas, a Home /
 * Slide Show / View ribbon, and a status bar. Text is edited in place; saving rewrites only the text
 * of the shapes that changed, so layouts, themes and images in the file are untouched.
 */
export default function PptxEditor({ doc, initialDeck }: { doc: OfficeDocument; initialDeck: Deck }) {
  const [deck, setDeck] = useState(initialDeck);
  const [active, setActive] = useState(0);
  const [title, setTitle] = useState(doc.title);
  const [status, setStatus] = useState<SaveState>('saved');
  const [message, setMessage] = useState<string>();
  const [tab, setTab] = useState('home');
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [fitScale, setFitScale] = useState(0.8);
  const [revision, setRevision] = useState(0);
  const [present, setPresent] = useState<number | null>(null);
  const [tools, setTools] = useState<Tools>(DEFAULT_TOOLS);
  const [busy, setBusy] = useState(false);

  const deckRef = useRef(deck);
  const dirty = useRef(new Set<string>());
  const titleDirty = useRef(false);
  const workspace = useRef<HTMLDivElement>(null);
  const lastRange = useRef<Range | null>(null);
  const pendingSize = useRef<number | null>(null);

  const scale = zoom === 'fit' ? fitScale : zoom / 100;
  const slide = deck.slides[active] ?? deck.slides[0]!;

  // Fit the slide to the available workspace.
  useEffect(() => {
    const el = workspace.current;
    if (!el) return;
    const measure = () => setFitScale(Math.max(0.2, Math.min((el.clientWidth - 64) / deck.width, (el.clientHeight - 64) / deck.height)));
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [deck.width, deck.height]);

  const markDirty = useCallback(() => setStatus((current) => (current === 'saving' ? current : 'dirty')), []);

  const onText = useCallback(
    (slideIndex: number, shapeId: string, paragraphs: SlideParagraph[]) => {
      // Update the ref synchronously too, so a save that runs right after a flush sees this edit.
      const next: Deck = {
        ...deckRef.current,
        slides: deckRef.current.slides.map((s) =>
          s.index === slideIndex ? { ...s, shapes: s.shapes.map((shape) => (shape.id === shapeId ? { ...shape, paragraphs } : shape)) } : s,
        ),
      };
      deckRef.current = next;
      setDeck(next);
      dirty.current.add(`${slideIndex}:${shapeId}`);
      markDirty();
    },
    [markDirty],
  );

  // ------------------------------------------------------------ selection and formatting

  useEffect(() => {
    document.execCommand?.('defaultParagraphSeparator', false, 'div');
    document.execCommand?.('styleWithCSS', false, 'true');
  }, []);

  useEffect(() => {
    const onSelection = () => {
      const selection = window.getSelection();
      const editable = editableOf(selection?.anchorNode ?? null);
      if (!selection || !editable || selection.rangeCount === 0) return;
      lastRange.current = selection.getRangeAt(0).cloneRange();
      const element = selection.anchorNode instanceof HTMLElement ? selection.anchorNode : selection.anchorNode?.parentElement;
      if (!element) return;
      const css = window.getComputedStyle(element);
      const block = element.closest<HTMLElement>('[data-editable] > div');
      setTools({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        font: css.fontFamily.split(',')[0]!.replace(/["']/g, '').trim().replace(/^Carlito$/i, 'Calibri'),
        size: Math.round((parseFloat(css.fontSize) / PX_PER_PT) * 2) / 2,
        color: toHex(css.color),
        bullet: block?.dataset.bullet === '1',
        align: (['left', 'center', 'right', 'justify'].includes(css.textAlign) ? css.textAlign : 'left') as Tools['align'],
      });
    };
    window.document.addEventListener('selectionchange', onSelection);
    return () => window.document.removeEventListener('selectionchange', onSelection);
  }, []);

  /** Runs `action` with the selection restored inside the text box the user was editing. */
  const withSelection = useCallback((action: (editable: HTMLElement) => void) => {
    const range = lastRange.current;
    const editable = editableOf(range?.startContainer ?? null);
    if (!range || !editable || !editable.isConnected) {
      setMessage('Click inside a text box on the slide first.');
      return;
    }
    setMessage(undefined);
    if (!editable.contains(window.getSelection()?.anchorNode ?? null)) {
      editable.focus();
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    }
    action(editable);
    // execCommand edits the DOM directly; tell React about it.
    editable.dispatchEvent(new Event('input', { bubbles: true }));
  }, []);

  /** Turns the browser's "xxx-large" marker into the requested point size. */
  const normalizeSizes = useCallback((editable: HTMLElement, pt: number) => {
    for (const el of Array.from(editable.querySelectorAll<HTMLElement>('[style*="xxx-large"], font[size="7"]'))) {
      el.style.fontSize = `${Math.round(pt * PX_PER_PT * 100) / 100}px`;
      el.removeAttribute('size');
    }
  }, []);

  const exec = (command: string, value?: string) => withSelection(() => void document.execCommand(command, false, value));

  const setSize = (pt: number) =>
    withSelection((editable) => {
      document.execCommand('fontSize', false, '7');
      normalizeSizes(editable, pt);
      pendingSize.current = window.getSelection()?.isCollapsed ? pt : null;
      setTools((t) => ({ ...t, size: pt }));
    });

  const stepSize = (direction: 1 | -1) => {
    const next = direction > 0 ? SIZES.find((s) => s > tools.size) : [...SIZES].reverse().find((s) => s < tools.size);
    if (next) setSize(next);
  };

  const toggleBullet = () =>
    withSelection((editable) => {
      const range = lastRange.current!;
      const blocks = Array.from(editable.children).filter((b): b is HTMLElement => b instanceof HTMLElement && (range.intersectsNode(b) || b.contains(range.startContainer)));
      const targets = blocks.length ? blocks : [editable.firstElementChild as HTMLElement];
      const turnOn = !targets.every((b) => b.dataset.bullet === '1');
      for (const block of targets) {
        if (turnOn) {
          block.dataset.bullet = '1';
          block.classList.add('slide-bullet');
        } else {
          delete block.dataset.bullet;
          block.classList.remove('slide-bullet');
        }
      }
      setTools((t) => ({ ...t, bullet: turnOn }));
    });

  // Text typed right after "set size" at a caret (no selection) still carries the browser's marker.
  useEffect(() => {
    const onInput = (event: Event) => {
      const editable = editableOf(event.target as Node);
      if (editable && pendingSize.current) normalizeSizes(editable, pendingSize.current);
    };
    window.document.addEventListener('input', onInput, true);
    return () => window.document.removeEventListener('input', onInput, true);
  }, [normalizeSizes]);

  // ------------------------------------------------------------------- saving and structure

  const flushFocused = () => {
    // Make sure every text box has reported its latest text, wherever focus is.
    (window.document.activeElement as HTMLElement | null)?.blur?.();
    window.dispatchEvent(new Event(FLUSH_EVENT));
  };

  const save = useCallback(async (): Promise<boolean> => {
    flushFocused();
    // Blur commits asynchronously through React state; wait a tick so `deck` is current.
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (dirty.current.size === 0 && !titleDirty.current) {
      setStatus('saved');
      return true;
    }
    setStatus('saving');
    setMessage(undefined);
    try {
      const bySlide = new Map<number, string[]>();
      for (const key of dirty.current) {
        const [slideIndex, shapeId] = key.split(':') as [string, string];
        bySlide.set(Number(slideIndex), [...(bySlide.get(Number(slideIndex)) ?? []), shapeId]);
      }
      await saveSlides(doc.id, {
        title: title.trim() || doc.title,
        slides: [...bySlide].map(([index, ids]) => ({
          index,
          shapes: ids.map((id) => ({ id, paragraphs: deckRef.current.slides[index]!.shapes.find((s) => s.id === id)!.paragraphs })),
        })),
      });
      dirty.current.clear();
      titleDirty.current = false;
      setStatus('saved');
      return true;
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof ApiClientError ? error.message : 'Could not save your changes.');
      return false;
    }
  }, [doc.id, doc.title, title]);

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

  async function structure(run: () => Promise<Deck>, nextActive: (deck: Deck) => number) {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await save())) return;
      const next = await run();
      deckRef.current = next;
      setDeck(next);
      setActive(Math.max(0, Math.min(next.slides.length - 1, nextActive(next))));
      setRevision((r) => r + 1);
      lastRange.current = null;
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : 'That change could not be made.');
    } finally {
      setBusy(false);
    }
  }

  const newSlide = () => structure(() => duplicateSlide(doc.id, active), () => active + 1);
  const removeSlide = () => {
    if (deck.slides.length <= 1) {
      setMessage('A presentation needs at least one slide.');
      return;
    }
    if (window.confirm('Delete this slide?')) void structure(() => deleteSlide(doc.id, active), () => active);
  };

  async function download() {
    if (await save()) window.location.assign(doc.downloadUrl);
  }

  // ------------------------------------------------------------------------ slide show

  useEffect(() => {
    if (present === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPresent(null);
      else if (['ArrowRight', 'ArrowDown', ' ', 'Enter', 'PageDown'].includes(event.key)) setPresent((p) => (p === null ? p : Math.min(deck.slides.length - 1, p + 1)));
      else if (['ArrowLeft', 'ArrowUp', 'Backspace', 'PageUp'].includes(event.key)) setPresent((p) => (p === null ? p : Math.max(0, p - 1)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [present, deck.slides.length]);

  // ---------------------------------------------------------------------------- ribbon

  const homeTab: RibbonTabSpec = {
    id: 'home',
    label: 'Home',
    content: (
      <>
        <RibbonGroup label="Undo">
          <RibbonStack>
            <RibbonButton label="Undo" icon="undo" onClick={() => exec('undo')} />
            <RibbonButton label="Redo" icon="redo" onClick={() => exec('redo')} />
          </RibbonStack>
        </RibbonGroup>
        <RibbonGroup label="Slides">
          <RibbonButton large label="New slide (duplicates the current slide)" icon="duplicate" text="New Slide" disabled={busy} onClick={() => void newSlide()} />
          <RibbonButton large label="Delete slide" icon="trash" text="Delete" disabled={busy} onClick={removeSlide} />
        </RibbonGroup>
        <RibbonGroup label="Font">
          <RibbonStack>
            <RibbonRow>
              <RibbonCombobox
                label="Font family"
                width="w-36"
                value={tools.font}
                options={[...new Set([tools.font, ...FONTS])].map((f) => ({ value: f, label: f }))}
                onChange={(v) => exec('fontName', v)}
              />
              <RibbonSelect
                label="Font size"
                width="w-16"
                value={String(tools.size)}
                options={[...new Set([tools.size, ...SIZES])].sort((a, b) => a - b).map((n) => ({ value: String(n), label: String(n) }))}
                onChange={(v) => setSize(Number(v))}
              />
              <RibbonButton label="Increase font size" icon="sizeUp" onClick={() => stepSize(1)} />
              <RibbonButton label="Decrease font size" icon="sizeDown" onClick={() => stepSize(-1)} />
            </RibbonRow>
            <RibbonRow>
              <RibbonButton label="Bold" text="B" active={tools.bold} onClick={() => exec('bold')} />
              <RibbonButton label="Italic" active={tools.italic} onClick={() => exec('italic')}>
                <i className="font-serif font-semibold">I</i>
              </RibbonButton>
              <RibbonButton label="Underline" active={tools.underline} onClick={() => exec('underline')}>
                <u className="font-semibold">U</u>
              </RibbonButton>
              <RibbonColor label="Font colour" value={tools.color} glyph="A" onChange={(hex) => exec('foreColor', hex)} />
            </RibbonRow>
          </RibbonStack>
        </RibbonGroup>
        <RibbonGroup label="Paragraph">
          <RibbonStack>
            <RibbonRow>
              <RibbonButton label="Bullets" icon="bullets" active={tools.bullet} onClick={toggleBullet} />
            </RibbonRow>
            <RibbonRow>
              <RibbonButton label="Align left" icon="alignLeft" active={tools.align === 'left'} onClick={() => exec('justifyLeft')} />
              <RibbonButton label="Center" icon="alignCenter" active={tools.align === 'center'} onClick={() => exec('justifyCenter')} />
              <RibbonButton label="Align right" icon="alignRight" active={tools.align === 'right'} onClick={() => exec('justifyRight')} />
              <RibbonButton label="Justify" icon="alignJustify" active={tools.align === 'justify'} onClick={() => exec('justifyFull')} />
            </RibbonRow>
          </RibbonStack>
        </RibbonGroup>
      </>
    ),
  };

  const showTab: RibbonTabSpec = {
    id: 'show',
    label: 'Slide Show',
    content: (
      <RibbonGroup label="Start Slide Show">
        <RibbonButton large label="From beginning" icon="play" text="From Start" onClick={() => setPresent(0)} />
        <RibbonButton large label="From current slide" icon="play" text="From Current" onClick={() => setPresent(active)} />
      </RibbonGroup>
    ),
  };

  const viewTab: RibbonTabSpec = {
    id: 'view',
    label: 'View',
    content: (
      <RibbonGroup label="Zoom">
        <RibbonButton large label="Fit slide to window" text="Fit" active={zoom === 'fit'} onClick={() => setZoom('fit')} />
        <RibbonButton large label="Zoom in" icon="zoomIn" text="Zoom in" onClick={() => setZoom(Math.min(200, Math.round(scale * 100) + 10))} />
        <RibbonButton large label="Zoom out" icon="zoomOut" text="Zoom out" onClick={() => setZoom(Math.max(25, Math.round(scale * 100) - 10))} />
        <RibbonButton large label="Zoom to 100%" text="100%" onClick={() => setZoom(100)} />
      </RibbonGroup>
    ),
  };

  const presenting = present === null ? undefined : deck.slides[present];
  const presentScale = presenting ? Math.min(window.innerWidth / deck.width, window.innerHeight / deck.height) : 1;

  return (
    <EditorShell>
      <TitleBar
        app="powerpoint"
        title={title}
        onTitleChange={(value) => {
          setTitle(value);
          titleDirty.current = true;
          markDirty();
        }}
        status={status}
        onSave={() => void save()}
        actions={
          <>
            <button type="button" onClick={() => setPresent(active)} className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm hover:bg-white/15">
              <Icon name="play" /> Present
            </button>
            <button type="button" onClick={() => void download()} disabled={status === 'saving'} className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-[#b7472a] hover:bg-slate-100 disabled:opacity-60">
              <Icon name="download" /> Download PPTX
            </button>
          </>
        }
      />
      <Ribbon app="powerpoint" tabs={[homeTab, showTab, viewTab]} activeId={tab} onActivate={setTab} />
      {message ? (
        <p role="alert" className="bg-amber-50 px-4 py-1.5 text-sm text-amber-900">
          {message}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Slides" className="w-44 shrink-0 overflow-y-auto border-r border-slate-300 bg-[#f3f3f3] p-2">
          <ol className="space-y-2">
            {deck.slides.map((s, i) => (
              <li key={`${revision}-${i}`} className="flex gap-1.5">
                <span className="w-4 pt-1 text-right text-xs text-slate-500">{i + 1}</span>
                <button
                  type="button"
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === active}
                  onClick={() => setActive(i)}
                  className={`overflow-hidden border-2 bg-white ${i === active ? 'border-[#b7472a]' : 'border-transparent hover:border-slate-400'}`}
                >
                  <SlideView deck={deck} slide={s} scale={THUMB_SCALE} />
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div ref={workspace} className="relative flex min-w-0 flex-1 overflow-auto bg-[#d4d4d4]">
          <div className="m-auto p-8">
            <div data-testid="slide-canvas" className="bg-white shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
              <SlideView key={`${revision}-${active}`} deck={deck} slide={slide} scale={scale} editing={{ resetKey: `${revision}-${active}`, onText }} />
            </div>
          </div>
        </div>
      </div>

      <StatusBar
        app="powerpoint"
        left={
          <>
            <span aria-live="polite">
              Slide {active + 1} of {deck.slides.length}
            </span>
          </>
        }
        right={<ZoomControl value={Math.round(scale * 100)} min={25} max={200} onChange={setZoom} />}
      />

      {presenting ? (
        <div role="dialog" aria-label="Slide show" className="fixed inset-0 z-[60] grid cursor-pointer place-items-center bg-black" onClick={() => setPresent((p) => (p === null ? p : p + 1 >= deck.slides.length ? null : p + 1))}>
          <SlideView deck={deck} slide={presenting} scale={presentScale} />
          <p className="pointer-events-none absolute bottom-3 right-4 text-xs text-white/50">
            {present! + 1} / {deck.slides.length} · Esc to exit
          </p>
        </div>
      ) : null}
    </EditorShell>
  );
}
