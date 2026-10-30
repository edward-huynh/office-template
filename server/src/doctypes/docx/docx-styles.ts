import JSZip from 'jszip';
import { parseXml } from '../pptx/xml.js';

export interface HeadingStyle {
  color?: string;
  sizePt?: number;
  font?: string;
}

export interface DocxStyles {
  headings: Partial<Record<1 | 2 | 3, HeadingStyle>>;
  defaults: { fontFamily?: string; fontSize?: number };
}

const HEADING_IDS: Record<string, 1 | 2 | 3> = { Heading1: 1, Heading2: 2, Heading3: 3 };

function runProps(rPr: Element | null | undefined) {
  if (!rPr) return {};
  const first = (name: string) => Array.from(rPr.childNodes).find((n) => n.nodeType === 1 && (n as Element).tagName === name) as Element | undefined;
  const color = first('w:color')?.getAttribute('w:val');
  const size = first('w:sz')?.getAttribute('w:val');
  const font = first('w:rFonts')?.getAttribute('w:ascii');
  return {
    color: color && /^[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : undefined,
    sizePt: size ? Number(size) / 2 : undefined,
    font: font ?? undefined,
  };
}

/** Reads the parts of `styles.xml` the editor needs to look like the template: heading looks and the body font. */
export async function readDocxStyles(file: Buffer): Promise<DocxStyles> {
  const empty: DocxStyles = { headings: {}, defaults: {} };
  try {
    const zip = await JSZip.loadAsync(file);
    const xml = await zip.file('word/styles.xml')?.async('string');
    if (!xml) return empty;
    const doc = parseXml(xml);

    const headings: DocxStyles['headings'] = {};
    for (const style of Array.from(doc.getElementsByTagName('w:style'))) {
      const level = HEADING_IDS[style.getAttribute('w:styleId') ?? ''];
      if (!level) continue;
      headings[level] = runProps(Array.from(style.childNodes).find((n) => n.nodeType === 1 && (n as Element).tagName === 'w:rPr') as Element | undefined);
    }
    const defaultProps = runProps(doc.getElementsByTagName('w:docDefaults')[0]?.getElementsByTagName('w:rPr')[0]);
    return { headings, defaults: { fontFamily: defaultProps.font, fontSize: defaultProps.sizePt } };
  } catch {
    return empty;
  }
}

/** Bakes heading colour and size into the HTML as inline styles, so they show in the editor and survive saving. */
export function applyHeadingStyles(html: string, headings: DocxStyles['headings']): string {
  return html.replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (match, level: string, inner: string) => {
    const style = headings[Number(level) as 1 | 2 | 3];
    if (!style) return match;
    const css = [
      style.color ? `color:#${style.color}` : '',
      style.sizePt ? `font-size:${style.sizePt}pt` : '',
      style.font ? `font-family:${style.font}` : '',
    ].filter(Boolean);
    return css.length ? `<h${level}><span style="${css.join(';')}">${inner}</span></h${level}>` : match;
  });
}
