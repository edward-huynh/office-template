import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { Deck, Slide, SlideParagraph, SlideShape } from '@office-template/server/contracts';
import { domToParagraphs, paragraphsToHtml, runStyle } from './slide-text';

const PX_PER_PT = 96 / 72;
const FONT = 'Calibri, Carlito, "Segoe UI", Arial, sans-serif';

const alignCss = { l: 'left', ctr: 'center', r: 'right', just: 'justify' } as const;

function boxStyle(shape: SlideShape): CSSProperties {
  return {
    position: 'absolute',
    left: shape.x,
    top: shape.y,
    width: shape.w,
    height: shape.h,
    background: shape.fill ? `#${shape.fill}` : undefined,
    borderRadius: shape.geometry === 'ellipse' ? '50%' : shape.geometry === 'roundRect' ? Math.min(shape.w, shape.h) * 0.1667 : undefined,
  };
}

function textContainerStyle(shape: SlideShape): CSSProperties {
  return {
    ...boxStyle(shape),
    display: 'flex',
    flexDirection: 'column',
    justifyContent: shape.valign === 'ctr' ? 'center' : shape.valign === 'b' ? 'flex-end' : 'flex-start',
    padding: '4.8px 9.6px',
    boxSizing: 'border-box',
    fontFamily: FONT,
    fontSize: shape.defaultSize * PX_PER_PT,
    color: `#${shape.defaultColor}`,
    fontWeight: shape.defaultBold ? 700 : undefined,
    lineHeight: 1.2,
    overflow: 'visible',
  };
}

function StaticParagraphs({ paragraphs }: { paragraphs: SlideParagraph[] }) {
  return (
    <>
      {paragraphs.map((p, i) => (
        <div key={i} className={p.bullet ? 'slide-bullet' : undefined} style={{ textAlign: p.align ? alignCss[p.align] : undefined }}>
          {p.runs.length === 0 ? <br /> : p.runs.map((run, j) => (run.text === '\n' ? <br key={j} /> : <span key={j} style={styleObject(runStyle(run))}>{run.text}</span>))}
        </div>
      ))}
    </>
  );
}

/** `a:b;c:d` → React style object (only the handful of properties `runStyle` emits). */
function styleObject(css: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const part of css.split(';')) {
    const [name, ...value] = part.split(':');
    if (!name) continue;
    out[name.trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = value.join(':').trim();
  }
  return out as CSSProperties;
}

/**
 * One editable text box. React sets the content once per `resetKey` and never re-renders it while
 * the user types (a re-render would reset the caret); edits flow out through `onInput`.
 */
function EditableText({
  shape,
  slideIndex,
  resetKey,
  onText,
}: {
  shape: SlideShape;
  slideIndex: number;
  resetKey: string;
  onText: (slideIndex: number, shapeId: string, paragraphs: SlideParagraph[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(shape);
  latest.current = shape;

  useLayoutEffect(() => {
    if (ref.current) ref.current.innerHTML = paragraphsToHtml(latest.current);
    syncEmpty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // "Click to add title" style hint, shown while the box is empty (never part of the saved text).
  const hint = /title/i.test(shape.name) ? 'Click to add title' : /sub/i.test(shape.name) ? 'Click to add subtitle' : 'Click to add text';
  const syncEmpty = () => {
    const el = ref.current;
    if (el) el.dataset.empty = (el.textContent ?? '').length === 0 ? 'true' : 'false';
  };

  const commit = () => {
    clearTimeout(timer.current);
    if (ref.current) onText(slideIndex, shape.id, domToParagraphs(ref.current));
  };

  return (
    <div style={textContainerStyle(shape)} className="slide-text-box">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        role="textbox"
        aria-multiline="true"
        aria-label={`Text: ${shape.name}`}
        data-editable="true"
        data-slide={slideIndex}
        data-shape={shape.id}
        data-hint={hint}
        className="slide-editable"
        onInput={() => {
          syncEmpty();
          clearTimeout(timer.current);
          timer.current = setTimeout(commit, 200);
        }}
        onBlur={commit}
      />
    </div>
  );
}

export interface SlideViewProps {
  deck: Deck;
  slide: Slide;
  scale: number;
  /** Present when the slide is editable; omitted for thumbnails and the slide show. */
  editing?: {
    resetKey: string;
    onText: (slideIndex: number, shapeId: string, paragraphs: SlideParagraph[]) => void;
  };
}

/** Renders a slide at its 96-dpi size inside a scaled stage, so text wraps exactly as it does in PowerPoint. */
export function SlideView({ deck, slide, scale, editing }: SlideViewProps) {
  return (
    <div style={{ width: deck.width * scale, height: deck.height * scale, position: 'relative', overflow: editing ? 'visible' : 'hidden' }}>
      <div
        data-testid={editing ? 'slide-stage' : undefined}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: deck.width,
          height: deck.height,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          background: `#${slide.background ?? 'FFFFFF'}`,
          overflow: 'hidden',
          // Thumbnails live inside <button>, which would otherwise pass its centring down to the text.
          textAlign: 'left',
        }}
      >
        {slide.shapes.map((shape) => {
          if (shape.kind === 'text') {
            return editing ? (
              <EditableText key={`${editing.resetKey}:${shape.id}`} shape={shape} slideIndex={slide.index} resetKey={editing.resetKey} onText={editing.onText} />
            ) : (
              <div key={shape.id} style={textContainerStyle(shape)}>
                <StaticParagraphs paragraphs={shape.paragraphs} />
              </div>
            );
          }
          if (shape.kind === 'image') {
            return <img key={shape.id} src={shape.image} alt="" draggable={false} style={{ ...boxStyle(shape), objectFit: 'fill' }} />;
          }
          if (shape.kind === 'unsupported') {
            return (
              <div
                key={shape.id}
                title={`${shape.label} (shown as a placeholder: not editable here)`}
                style={{ ...boxStyle(shape), border: '1.5px dashed #9ca3af', background: 'rgba(156,163,175,0.12)', color: '#6b7280', display: 'grid', placeItems: 'center', fontFamily: FONT, fontSize: 14 }}
              >
                {shape.label}
              </div>
            );
          }
          return <div key={shape.id} style={boxStyle(shape)} />;
        })}
      </div>
    </div>
  );
}
