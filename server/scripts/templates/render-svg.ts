import { Resvg } from '@resvg/resvg-js';
import { GEOMETRY, SLIDE } from './render-pptx.js';
import type { DocxBlock, DocxSpec, PptxSpec, SlideSpec } from './specs.js';

const FONT = 'Arial, Helvetica, sans-serif';
const escapeXml = (value: string) => value.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Greedy word wrap using an average glyph width of 0.5 em. */
function wrap(text: string, widthPx: number, fontPx: number): string[] {
  const maxChars = Math.max(8, Math.floor(widthPx / (fontPx * 0.5)));
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(' ')) {
      if (line && `${line} ${word}`.length > maxChars) {
        out.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    out.push(line);
  }
  return out;
}

const textEl = (x: number, y: number, size: number, content: string, extra = '') =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" ${extra}>${escapeXml(content)}</text>`;

// ---------------------------------------------------------------- slides

const PX_PER_IN = 80;
const PT_TO_PX = PX_PER_IN / 72;
const inch = (value: number) => value * PX_PER_IN;

export function slideSvg(spec: PptxSpec, slide: SlideSpec): string {
  const { theme } = spec;
  const parts: string[] = [];
  const bg = slide.layout === 'section' ? theme.accent : theme.bg;
  parts.push(`<rect width="100%" height="100%" fill="#${bg}"/>`);

  const block = (text: string, box: { x: number; y: number; w: number; h: number }, ptSize: number, color: string, opts: { bold?: boolean; valign?: 'top' | 'bottom' | 'middle'; bullet?: boolean } = {}) => {
    const px = ptSize * PT_TO_PX;
    const indent = opts.bullet ? px * 1.2 : 0;
    const lines = wrap(text, inch(box.w) - indent, px);
    const lineHeight = px * 1.25;
    const total = lines.length * lineHeight;
    const top = inch(box.y);
    const height = inch(box.h);
    const start = opts.valign === 'bottom' ? top + height - total : opts.valign === 'middle' ? top + (height - total) / 2 : top;
    const weight = opts.bold ? 'font-weight="700"' : '';
    lines.forEach((line, i) => {
      const y = start + (i + 1) * lineHeight - lineHeight * 0.22;
      if (opts.bullet && i === 0) parts.push(textEl(inch(box.x), y, px, '•', `fill="#${color}"`));
      parts.push(textEl(inch(box.x) + indent, y, px, line, `fill="#${color}" ${weight}`));
    });
    return total;
  };

  const bulletList = (items: string[], box: { x: number; y: number; w: number; h: number }, ptSize: number) => {
    let y = box.y;
    for (const item of items) {
      const used = block(item, { ...box, y, h: box.h }, ptSize, theme.fg, { bullet: true });
      y += used / PX_PER_IN + 0.14;
    }
  };

  const header = (title: string) => {
    const t = GEOMETRY.header.title;
    block(title, t, t.size, theme.fg, { bold: true, valign: 'middle' });
    const r = GEOMETRY.header.rule;
    parts.push(`<rect x="${inch(r.x)}" y="${inch(r.y)}" width="${inch(r.w)}" height="${inch(r.h)}" fill="#${theme.accent}"/>`);
  };

  switch (slide.layout) {
    case 'title':
    case 'closing': {
      const g = GEOMETRY.titleSlide;
      parts.push(`<rect x="0" y="0" width="${inch(g.bar.w)}" height="${inch(g.bar.h)}" fill="#${theme.accent}"/>`);
      block(slide.title, g.title, g.title.size, theme.fg, { bold: true, valign: 'bottom' });
      block(slide.subtitle, g.subtitle, g.subtitle.size, theme.muted);
      break;
    }
    case 'section': {
      const g = GEOMETRY.section;
      block(slide.title, g.title, g.title.size, theme.bg, { bold: true, valign: 'bottom' });
      if (slide.subtitle) block(slide.subtitle, g.subtitle, g.subtitle.size, theme.bg);
      break;
    }
    case 'bullets':
      header(slide.title);
      bulletList(slide.bullets, GEOMETRY.bullets, GEOMETRY.bullets.size);
      break;
    case 'two-column':
      header(slide.title);
      slide.columns.forEach((column, index) => {
        const pos = GEOMETRY.columns[index]!;
        block(column.heading, { x: pos.x, y: pos.y, w: pos.w, h: GEOMETRY.columnHeading.h }, GEOMETRY.columnHeading.size, theme.accent, { bold: true, valign: 'middle' });
        bulletList(column.bullets, { x: pos.x, y: pos.y + GEOMETRY.columnBody.dy, w: pos.w, h: GEOMETRY.columnBody.h }, GEOMETRY.columnBody.size);
      });
      break;
    case 'blank': {
      const g = GEOMETRY.blank;
      for (const [box, hint] of [[g.title, 'Click to add title'], [g.body, 'Click to add text']] as const) {
        parts.push(`<rect x="${inch(box.x)}" y="${inch(box.y)}" width="${inch(box.w)}" height="${inch(box.h)}" fill="none" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 5" rx="4"/>`);
        parts.push(textEl(inch(box.x) + 14, inch(box.y) + inch(box.h) / 2 + 8, box.size * PT_TO_PX, hint, 'fill="#94a3b8"'));
      }
      break;
    }
    case 'stats': {
      header(slide.title);
      const g = GEOMETRY.stats;
      slide.stats.forEach((stat, index) => {
        const x = g.x0 + index * (g.w + g.gap);
        parts.push(`<rect x="${inch(x)}" y="${inch(g.y)}" width="${inch(g.w)}" height="${inch(g.h)}" rx="${inch(0.15)}" fill="#${theme.card}"/>`);
        parts.push(textEl(inch(x + g.w / 2), inch(g.y + 1.25), g.valueSize * PT_TO_PX, stat.value, `text-anchor="middle" font-weight="700" fill="#${theme.accent}"`));
        parts.push(textEl(inch(x + g.w / 2), inch(g.y + 1.9), g.labelSize * PT_TO_PX, stat.label, `text-anchor="middle" fill="#${theme.muted}"`));
      });
      break;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${inch(SLIDE.w)}" height="${inch(SLIDE.h)}" viewBox="0 0 ${inch(SLIDE.w)} ${inch(SLIDE.h)}">${parts.join('')}</svg>`;
}

// ------------------------------------------------------------------ pages

const PAGE = { w: 612, h: 792, marginX: 72, marginTop: 60, marginBottom: 60 };

/** Paginates the spec into letter-size SVG pages that approximate the real DOCX layout. */
export function docxPagesSvg(spec: DocxSpec): string[] {
  const pages: string[][] = [[]];
  let y = PAGE.marginTop;
  const width = PAGE.w - PAGE.marginX * 2;
  const current = () => pages[pages.length - 1]!;
  const ensure = (needed: number) => {
    if (y + needed > PAGE.h - PAGE.marginBottom) {
      pages.push([]);
      y = PAGE.marginTop;
    }
  };

  const paragraph = (text: string, size: number, opts: { color?: string; bold?: boolean; x?: number; w?: number; after?: number } = {}) => {
    const x = opts.x ?? PAGE.marginX;
    const lines = wrap(text, opts.w ?? width, size);
    const lh = size * 1.35;
    ensure(lh);
    for (const line of lines) {
      ensure(lh);
      y += lh;
      current().push(textEl(x, y - lh * 0.25, size, line, `fill="#${opts.color ?? '262626'}" ${opts.bold ? 'font-weight="700"' : ''}`));
    }
    y += opts.after ?? 6;
  };

  for (const block of spec.blocks as DocxBlock[]) {
    switch (block.t) {
      case 'title':
        paragraph(block.text, 26, { color: spec.accent, bold: true, after: 4 });
        break;
      case 'subtitle':
        paragraph(block.text, 10.5, { color: '595959', after: 14 });
        break;
      case 'h':
        y += 8;
        paragraph(block.text, 14, { color: spec.accent, bold: true, after: 4 });
        break;
      case 'p':
        paragraph(block.text, 11, { after: 7 });
        break;
      case 'bullets':
        for (const item of block.items) {
          ensure(16);
          const startY = y;
          paragraph(item, 11, { x: PAGE.marginX + 22, w: width - 22, after: 3 });
          current().push(textEl(PAGE.marginX + 8, startY + 11 * 1.1, 11, '•', 'fill="#262626"'));
        }
        y += 4;
        break;
      case 'table': {
        const colW = width / block.header.length;
        const rowH = 22;
        ensure(rowH * (block.rows.length + 1));
        const drawRow = (cells: string[], header: boolean) => {
          cells.forEach((cell, i) => {
            const x = PAGE.marginX + i * colW;
            const fill = header ? `#${spec.accent}` : '#ffffff';
            current().push(`<rect x="${x}" y="${y}" width="${colW}" height="${rowH}" fill="${fill}" stroke="#bfbfbf" stroke-width="0.8"/>`);
            const clipped = cell.length > Math.floor(colW / 5.6) ? `${cell.slice(0, Math.floor(colW / 5.6) - 1)}…` : cell;
            current().push(textEl(x + 6, y + 15, 10, clipped, `fill="${header ? '#ffffff' : '#262626'}" ${header ? 'font-weight="700"' : ''}`));
          });
          y += rowH;
        };
        drawRow(block.header, true);
        block.rows.forEach((row) => drawRow(row, false));
        y += 12;
        break;
      }
    }
  }
  return pages.map(
    (content) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.w}" height="${PAGE.h}" viewBox="0 0 ${PAGE.w} ${PAGE.h}"><rect width="100%" height="100%" fill="#ffffff"/>${content.join('')}</svg>`,
  );
}

export function svgToPng(svg: string, width: number): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true, defaultFontFamily: 'Arial' },
    background: 'white',
  });
  return Buffer.from(resvg.render().asPng());
}
