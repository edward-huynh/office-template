import PptxGenJS from 'pptxgenjs';
import type { PptxSpec, SlideSpec } from './specs.js';

/**
 * Slide geometry in inches on a 10 x 5.625 canvas. render-svg.ts imports the same numbers so the
 * preview images match the real slides.
 */
export const SLIDE = { w: 10, h: 5.625 } as const;

export const GEOMETRY = {
  titleSlide: { bar: { x: 0, y: 0, w: 0.25, h: SLIDE.h }, title: { x: 0.8, y: 1.6, w: 8.4, h: 1.3, size: 38 }, subtitle: { x: 0.8, y: 3.05, w: 8.4, h: 0.9, size: 18 } },
  header: { title: { x: 0.6, y: 0.4, w: 8.8, h: 0.8, size: 28 }, rule: { x: 0.6, y: 1.22, w: 1.2, h: 0.06 } },
  bullets: { x: 0.6, y: 1.55, w: 8.8, h: 3.4, size: 20 },
  columns: [
    { x: 0.6, y: 1.55, w: 4.2 },
    { x: 5.2, y: 1.55, w: 4.2 },
  ],
  columnHeading: { h: 0.5, size: 18 },
  columnBody: { dy: 0.6, h: 2.9, size: 16 },
  section: { title: { x: 0.8, y: 1.9, w: 8.4, h: 1.4, size: 42 }, subtitle: { x: 0.8, y: 3.4, w: 8.4, h: 0.8, size: 20 } },
  stats: { y: 1.8, h: 2.5, w: 2.8, gap: 0.2, x0: 0.6, valueSize: 40, labelSize: 14 },
  blank: {
    title: { x: 0.6, y: 0.4, w: 8.8, h: 1.1, size: 36 },
    body: { x: 0.6, y: 1.7, w: 8.8, h: 3.3, size: 20 },
  },
} as const;

function addSlide(pptx: PptxGenJS, spec: PptxSpec, slide: SlideSpec) {
  const { theme } = spec;
  const s = pptx.addSlide();
  const font = 'Calibri';

  const header = (title: string) => {
    const { title: t, rule } = GEOMETRY.header;
    s.addText(title, { x: t.x, y: t.y, w: t.w, h: t.h, fontFace: font, fontSize: t.size, bold: true, color: theme.fg, valign: 'middle' });
    s.addShape(pptx.ShapeType.rect, { x: rule.x, y: rule.y, w: rule.w, h: rule.h, fill: { color: theme.accent }, line: { color: theme.accent } });
  };

  switch (slide.layout) {
    case 'title':
    case 'closing': {
      const g = GEOMETRY.titleSlide;
      s.background = { color: theme.bg };
      s.addShape(pptx.ShapeType.rect, { ...g.bar, fill: { color: theme.accent }, line: { color: theme.accent } });
      s.addText(slide.title, { x: g.title.x, y: g.title.y, w: g.title.w, h: g.title.h, fontFace: font, fontSize: g.title.size, bold: true, color: theme.fg, valign: 'bottom' });
      s.addText(slide.subtitle, { x: g.subtitle.x, y: g.subtitle.y, w: g.subtitle.w, h: g.subtitle.h, fontFace: font, fontSize: g.subtitle.size, color: theme.muted, valign: 'top' });
      break;
    }
    case 'section': {
      const g = GEOMETRY.section;
      s.background = { color: theme.accent };
      s.addText(slide.title, { x: g.title.x, y: g.title.y, w: g.title.w, h: g.title.h, fontFace: font, fontSize: g.title.size, bold: true, color: theme.bg, valign: 'bottom' });
      if (slide.subtitle) {
        s.addText(slide.subtitle, { x: g.subtitle.x, y: g.subtitle.y, w: g.subtitle.w, h: g.subtitle.h, fontFace: font, fontSize: g.subtitle.size, color: theme.bg, valign: 'top' });
      }
      break;
    }
    case 'bullets': {
      const g = GEOMETRY.bullets;
      s.background = { color: theme.bg };
      header(slide.title);
      s.addText(
        slide.bullets.map((text) => ({ text, options: { bullet: { indent: 18 }, breakLine: true, paraSpaceAfter: 10 } })),
        { x: g.x, y: g.y, w: g.w, h: g.h, fontFace: font, fontSize: g.size, color: theme.fg, valign: 'top' },
      );
      break;
    }
    case 'two-column': {
      s.background = { color: theme.bg };
      header(slide.title);
      slide.columns.forEach((column, index) => {
        const pos = GEOMETRY.columns[index]!;
        s.addText(column.heading, { x: pos.x, y: pos.y, w: pos.w, h: GEOMETRY.columnHeading.h, fontFace: font, fontSize: GEOMETRY.columnHeading.size, bold: true, color: theme.accent, valign: 'middle' });
        s.addText(
          column.bullets.map((text) => ({ text, options: { bullet: { indent: 16 }, breakLine: true, paraSpaceAfter: 8 } })),
          { x: pos.x, y: pos.y + GEOMETRY.columnBody.dy, w: pos.w, h: GEOMETRY.columnBody.h, fontFace: font, fontSize: GEOMETRY.columnBody.size, color: theme.fg, valign: 'top' },
        );
      });
      break;
    }
    case 'blank': {
      const g = GEOMETRY.blank;
      s.background = { color: theme.bg };
      // Empty text boxes: the editor shows "Click to add ..." hints, and typed text takes this formatting.
      s.addText('', { x: g.title.x, y: g.title.y, w: g.title.w, h: g.title.h, fontFace: font, fontSize: g.title.size, bold: true, color: theme.fg, valign: 'middle', objectName: 'Title' });
      s.addText('', { x: g.body.x, y: g.body.y, w: g.body.w, h: g.body.h, fontFace: font, fontSize: g.body.size, color: theme.fg, valign: 'top', bullet: { indent: 18 }, objectName: 'Content' });
      break;
    }
    case 'stats': {
      const g = GEOMETRY.stats;
      s.background = { color: theme.bg };
      header(slide.title);
      slide.stats.forEach((stat, index) => {
        const x = g.x0 + index * (g.w + g.gap);
        s.addShape(pptx.ShapeType.roundRect, { x, y: g.y, w: g.w, h: g.h, fill: { color: theme.card }, line: { color: theme.card }, rectRadius: 0.15 });
        s.addText(stat.value, { x, y: g.y + 0.5, w: g.w, h: 1.0, align: 'center', fontFace: font, fontSize: g.valueSize, bold: true, color: theme.accent });
        s.addText(stat.label, { x, y: g.y + 1.5, w: g.w, h: 0.6, align: 'center', fontFace: font, fontSize: g.labelSize, color: theme.muted });
      });
      break;
    }
  }
}

export async function renderPptx(spec: PptxSpec): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = spec.name;
  pptx.subject = spec.description;
  pptx.author = 'Office Template Library';
  for (const slide of spec.slides) addSlide(pptx, spec, slide);
  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
}
