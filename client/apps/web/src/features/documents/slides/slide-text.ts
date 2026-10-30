import type { SlideParagraph, SlideRun, SlideShape } from '@office-template/server/contracts';

/**
 * Conversion between the slide model and the DOM of an editable text box. Rendering writes every
 * explicit run property as an inline style, and parsing reads them back, so the round trip is
 * lossless for what the model can express. Properties a run does not set stay inherited.
 */
const PX_PER_PT = 96 / 72;

const ALIGN_TO_CSS = { l: 'left', ctr: 'center', r: 'right', just: 'justify' } as const;
const CSS_TO_ALIGN: Record<string, SlideParagraph['align']> = {
  left: 'l', start: 'l', center: 'ctr', right: 'r', end: 'r', justify: 'just',
};

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function runStyle(run: SlideRun): string {
  const css: string[] = [];
  if (run.bold !== undefined) css.push(`font-weight:${run.bold ? 700 : 400}`);
  if (run.italic !== undefined) css.push(`font-style:${run.italic ? 'italic' : 'normal'}`);
  if (run.underline !== undefined) css.push(`text-decoration:${run.underline ? 'underline' : 'none'}`);
  if (run.size !== undefined) css.push(`font-size:${Math.round(run.size * PX_PER_PT * 100) / 100}px`);
  if (run.color) css.push(`color:#${run.color}`);
  if (run.font) css.push(`font-family:${JSON.stringify(run.font).slice(1, -1)},Carlito,Calibri,Arial,sans-serif`);
  return css.join(';');
}

function runHtml(run: SlideRun): string {
  if (run.text === '\n') return '<br>';
  const style = runStyle(run);
  return `<span${style ? ` style="${escapeHtml(style)}"` : ''}>${escapeHtml(run.text)}</span>`;
}

export function paragraphsToHtml(shape: Pick<SlideShape, 'paragraphs'>): string {
  const paragraphs = shape.paragraphs.length ? shape.paragraphs : [{ runs: [] }];
  return paragraphs
    .map((p) => {
      const align = p.align ? `text-align:${ALIGN_TO_CSS[p.align]}` : '';
      const content = p.runs.map(runHtml).join('') || '<br>';
      return `<div${p.bullet ? ' data-bullet="1" class="slide-bullet"' : ''}${align ? ` style="${align}"` : ''}>${content}</div>`;
    })
    .join('');
}

// ------------------------------------------------------------------- DOM → model

interface Format {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: number;
  color?: string;
  font?: string;
}

function rgbToHex(value: string): string | undefined {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) return hex[1]!.toUpperCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (short) return `${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase();
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
  return undefined;
}

function formatOf(el: HTMLElement, inherited: Format): Format {
  const next: Format = { ...inherited };
  const tag = el.tagName;
  if (tag === 'B' || tag === 'STRONG') next.bold = true;
  if (tag === 'I' || tag === 'EM') next.italic = true;
  if (tag === 'U') next.underline = true;
  const style = el.style;
  if (style.fontWeight) next.bold = style.fontWeight === 'bold' || Number(style.fontWeight) >= 600;
  if (style.fontStyle) next.italic = style.fontStyle === 'italic';
  if (style.textDecorationLine || style.textDecoration) {
    next.underline = (style.textDecorationLine || style.textDecoration).includes('underline');
  }
  if (style.fontSize) {
    const n = parseFloat(style.fontSize);
    if (style.fontSize.endsWith('px')) next.size = Math.round((n / PX_PER_PT) * 100) / 100;
    else if (style.fontSize.endsWith('pt')) next.size = n;
  }
  if (style.color) next.color = rgbToHex(style.color) ?? next.color;
  if (tag === 'FONT' && el.getAttribute('color')) next.color = rgbToHex(el.getAttribute('color')!) ?? next.color;
  if (style.fontFamily) {
    const first = style.fontFamily.split(',')[0]!.trim().replace(/^["']|["']$/g, '');
    if (first && !/^(carlito|sans-serif|serif|inherit)$/i.test(first)) next.font = first;
  }
  return next;
}

function collectRuns(node: Node, inherited: Format, out: SlideRun[]) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent ?? '').replace(/ /g, ' ');
      if (text) out.push({ text, ...inherited });
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      if (el.tagName === 'BR') out.push({ text: '\n' });
      else collectRuns(el, formatOf(el, inherited), out);
    }
  }
}

function mergeRuns(runs: SlideRun[]): SlideRun[] {
  const merged: SlideRun[] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    const sameFormat = last && last.text !== '\n' && run.text !== '\n' &&
      last.bold === run.bold && last.italic === run.italic && last.underline === run.underline &&
      last.size === run.size && last.color === run.color && last.font === run.font;
    if (sameFormat) last.text += run.text;
    else merged.push({ ...run });
  }
  return merged;
}

/** A trailing `<br>` is the browser's placeholder for an empty line, not a real line break. */
function dropPlaceholderBreak(runs: SlideRun[]): SlideRun[] {
  return runs.length === 1 && runs[0]!.text === '\n' ? [] : runs;
}

const isBlock = (node: Node) => node.nodeType === Node.ELEMENT_NODE && ['DIV', 'P', 'LI'].includes((node as HTMLElement).tagName);

export function domToParagraphs(root: HTMLElement): SlideParagraph[] {
  // Text typed outside any block (before the first Enter) is gathered into one paragraph.
  const blocks: HTMLElement[] = [];
  let loose: HTMLElement | undefined;
  for (const node of Array.from(root.childNodes)) {
    if (isBlock(node)) {
      loose = undefined;
      blocks.push(node as HTMLElement);
    } else {
      if (!loose) {
        loose = document.createElement('div');
        blocks.push(loose);
      }
      loose.appendChild(node.cloneNode(true));
    }
  }
  return blocks.map((block) => {
    const runs: SlideRun[] = [];
    collectRuns(block, {}, runs);
    const paragraph: SlideParagraph = { runs: dropPlaceholderBreak(mergeRuns(runs)) };
    const align = CSS_TO_ALIGN[block.style.textAlign];
    if (align) paragraph.align = align;
    paragraph.bullet = block.dataset.bullet === '1';
    return paragraph;
  });
}
