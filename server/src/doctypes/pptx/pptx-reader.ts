import type { Deck, Slide, SlideParagraph, SlideRun, SlideShape } from '../../contracts/index.js';
import { child, children, path, PptxPackage, REL_TYPE, resolveTarget } from './xml.js';

const EMU_PER_PX = 9525;
const MAX_INLINE_IMAGE_BYTES = 1_500_000;
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml' };

const px = (value: string | null | undefined) => Math.round((Number(value ?? 0) / EMU_PER_PX) * 10) / 10;

type Theme = Record<string, string>;
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface StyleDefaults {
  size?: number;
  color?: string;
  bold?: boolean;
  bullet?: boolean;
}
interface SlideContext {
  layout?: Document;
  master?: Document;
}

async function readTheme(pkg: PptxPackage): Promise<Theme> {
  const doc = await pkg.xml('ppt/theme/theme1.xml');
  const theme: Theme = {};
  const scheme = doc?.getElementsByTagName('a:clrScheme')[0];
  for (const entry of Array.from(scheme?.childNodes ?? [])) {
    const el = entry as Element;
    if (el.nodeType !== 1) continue;
    const name = el.tagName.replace('a:', '');
    const srgb = child(el, 'a:srgbClr')?.getAttribute('val');
    const sys = child(el, 'a:sysClr')?.getAttribute('lastClr');
    const value = srgb ?? sys;
    if (value) theme[name] = value.toUpperCase();
  }
  return theme;
}

const SCHEME_ALIAS: Record<string, string> = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };

/** Colour inside a fill-like element (`a:solidFill`, `a:buClr`…). Colour transforms such as lumMod are ignored. */
function colorIn(holder: Element | undefined, theme: Theme): string | undefined {
  if (!holder) return undefined;
  const srgb = child(holder, 'a:srgbClr')?.getAttribute('val');
  if (srgb) return srgb.toUpperCase();
  const scheme = child(holder, 'a:schemeClr')?.getAttribute('val');
  if (scheme) return theme[SCHEME_ALIAS[scheme] ?? scheme];
  const sys = child(holder, 'a:sysClr')?.getAttribute('lastClr');
  return sys?.toUpperCase();
}

function readXfrm(xfrm: Element | undefined): Box | undefined {
  const off = child(xfrm, 'a:off');
  const ext = child(xfrm, 'a:ext');
  if (!off || !ext) return undefined;
  return { x: px(off.getAttribute('x')), y: px(off.getAttribute('y')), w: px(ext.getAttribute('cx')), h: px(ext.getAttribute('cy')) };
}

function placeholderOf(shape: Element): { type?: string; idx?: string } | undefined {
  const ph = path(shape, 'p:nvSpPr', 'p:nvPr', 'p:ph');
  if (!ph) return undefined;
  return { type: ph.getAttribute('type') ?? undefined, idx: ph.getAttribute('idx') ?? undefined };
}

/** Looks up an inherited position: layout placeholder first, then the master's. */
function inheritedBox(ph: { type?: string; idx?: string }, ctx: SlideContext): Box | undefined {
  for (const doc of [ctx.layout, ctx.master]) {
    if (!doc) continue;
    const tree = path(doc, 'p:sldLayout', 'p:cSld', 'p:spTree') ?? path(doc, 'p:sldMaster', 'p:cSld', 'p:spTree');
    let fallback: Box | undefined;
    for (const sp of children(tree, 'p:sp')) {
      const other = placeholderOf(sp);
      const box = readXfrm(path(sp, 'p:spPr', 'a:xfrm'));
      if (!other || !box) continue;
      if (ph.idx !== undefined && other.idx === ph.idx) return box;
      if (other.type === ph.type || (ph.type === 'ctrTitle' && other.type === 'title')) fallback ??= box;
    }
    if (fallback) return fallback;
  }
  return undefined;
}

function masterStyle(master: Document | undefined, ph: { type?: string } | undefined): Element | undefined {
  const styles = path(master, 'p:sldMaster', 'p:txStyles');
  const group = !ph?.type || ['body', 'obj', 'subTitle'].includes(ph.type)
    ? 'p:bodyStyle'
    : ['title', 'ctrTitle'].includes(ph.type)
      ? 'p:titleStyle'
      : 'p:otherStyle';
  return path(styles, group, 'a:lvl1pPr');
}

function styleDefaults(lvl1: Element | undefined, theme: Theme): StyleDefaults {
  const def = child(lvl1, 'a:defRPr');
  const size = def?.getAttribute('sz');
  return {
    size: size ? Number(size) / 100 : undefined,
    color: colorIn(child(def, 'a:solidFill'), theme),
    bold: flag(def?.getAttribute('b') ?? null),
    bullet: lvl1 ? Boolean(child(lvl1, 'a:buChar') || child(lvl1, 'a:buAutoNum')) && !child(lvl1, 'a:buNone') : undefined,
  };
}

function flag(value: string | null): boolean | undefined {
  return value === null ? undefined : value === '1' || value === 'true';
}

function readRun(r: Element, theme: Theme): SlideRun {
  const rPr = child(r, 'a:rPr');
  const size = rPr?.getAttribute('sz');
  const underline = rPr?.getAttribute('u');
  const run: SlideRun = { text: child(r, 'a:t')?.textContent ?? '' };
  const bold = flag(rPr?.getAttribute('b') ?? null);
  const italic = flag(rPr?.getAttribute('i') ?? null);
  const color = colorIn(child(rPr, 'a:solidFill'), theme);
  const font = child(rPr, 'a:latin')?.getAttribute('typeface');
  if (bold !== undefined) run.bold = bold;
  if (italic !== undefined) run.italic = italic;
  if (underline) run.underline = underline !== 'none';
  if (size) run.size = Number(size) / 100;
  if (color) run.color = color;
  if (font && !font.startsWith('+')) run.font = font;
  return run;
}

function readParagraph(p: Element, theme: Theme, defaultBullet: boolean | undefined): SlideParagraph {
  const pPr = child(p, 'a:pPr');
  const align = pPr?.getAttribute('algn');
  const explicitBullet = child(pPr, 'a:buNone')
    ? false
    : child(pPr, 'a:buChar') || child(pPr, 'a:buAutoNum')
      ? true
      : undefined;
  const runs: SlideRun[] = [];
  for (let node = p.firstChild; node; node = node.nextSibling) {
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    if (el.tagName === 'a:r' || el.tagName === 'a:fld') runs.push(readRun(el, theme));
    else if (el.tagName === 'a:br') runs.push({ text: '\n' });
  }
  const paragraph: SlideParagraph = { runs };
  if (align === 'l' || align === 'ctr' || align === 'r' || align === 'just') paragraph.align = align;
  const bullet = explicitBullet ?? defaultBullet;
  if (bullet !== undefined) paragraph.bullet = bullet;
  return paragraph;
}

function readSp(sp: Element, ctx: SlideContext, theme: Theme): SlideShape | undefined {
  const cNvPr = path(sp, 'p:nvSpPr', 'p:cNvPr');
  const id = cNvPr?.getAttribute('id');
  if (!id) return undefined;
  const ph = placeholderOf(sp);
  const spPr = child(sp, 'p:spPr');
  const box = readXfrm(child(spPr, 'a:xfrm')) ?? (ph ? inheritedBox(ph, ctx) : undefined);
  if (!box) return undefined;

  const prst = child(spPr, 'a:prstGeom')?.getAttribute('prst');
  const txBody = child(sp, 'p:txBody');
  const inherited = styleDefaults(masterStyle(ctx.master, ph), theme);
  const own = styleDefaults(path(txBody, 'a:lstStyle', 'a:lvl1pPr'), theme);
  const paragraphs = txBody ? children(txBody, 'a:p').map((p) => readParagraph(p, theme, inherited.bullet)) : [];
  const hasText = paragraphs.some((p) => p.runs.some((r) => r.text.trim() !== ''));
  const anchor = path(txBody, 'a:bodyPr')?.getAttribute('anchor');

  // An empty shape with no fill and no outline is an empty text box (what "Insert > Text Box" makes
  // before you type): it is invisible, so the only reason for it to exist is to be typed into.
  const fill = colorIn(child(spPr, 'a:solidFill'), theme);
  const outlined = Boolean(path(spPr, 'a:ln', 'a:solidFill'));
  const kind = txBody && (hasText || ph || (!fill && !outlined)) ? 'text' : 'shape';

  // In an empty paragraph, new text is formatted like `a:endParaRPr` (this is what PowerPoint does too).
  const endRPr = hasText ? undefined : child(child(txBody, 'a:p'), 'a:endParaRPr');
  const endSize = endRPr?.getAttribute('sz');
  const end: StyleDefaults = {
    size: endSize ? Number(endSize) / 100 : undefined,
    color: colorIn(child(endRPr, 'a:solidFill'), theme),
    bold: flag(endRPr?.getAttribute('b') ?? null),
  };

  return {
    id,
    name: cNvPr?.getAttribute('name') ?? `Shape ${id}`,
    kind,
    geometry: prst === 'roundRect' ? 'roundRect' : prst === 'ellipse' ? 'ellipse' : 'rect',
    ...box,
    fill,
    valign: anchor === 'ctr' ? 'ctr' : anchor === 'b' ? 'b' : 't',
    defaultSize: own.size ?? end.size ?? inherited.size ?? 18,
    defaultColor: own.color ?? end.color ?? inherited.color ?? theme.dk1 ?? '000000',
    defaultBold: own.bold ?? end.bold ?? inherited.bold,
    paragraphs: kind === 'text' ? paragraphs : [],
  };
}

async function readPic(pkg: PptxPackage, slidePath: string, pic: Element): Promise<SlideShape | undefined> {
  const cNvPr = path(pic, 'p:nvPicPr', 'p:cNvPr');
  const id = cNvPr?.getAttribute('id');
  const box = readXfrm(path(pic, 'p:spPr', 'a:xfrm'));
  if (!id || !box) return undefined;
  const base: SlideShape = {
    id,
    name: cNvPr?.getAttribute('name') ?? `Picture ${id}`,
    kind: 'unsupported',
    geometry: 'rect',
    ...box,
    valign: 't',
    defaultSize: 18,
    defaultColor: '000000',
    paragraphs: [],
    label: 'Picture',
  };
  const embed = path(pic, 'p:blipFill', 'a:blip')?.getAttribute('r:embed');
  const rel = (await pkg.relationships(slidePath)).find((r) => r.id === embed && r.type === REL_TYPE.image);
  const file = rel ? pkg.zip.file(resolveTarget(slidePath, rel.target)) : undefined;
  const mime = rel ? MIME[rel.target.split('.').pop()?.toLowerCase() ?? ''] : undefined;
  if (!file || !mime) return base;
  const bytes = await file.async('nodebuffer');
  if (bytes.byteLength > MAX_INLINE_IMAGE_BYTES) return base;
  return { ...base, kind: 'image', image: `data:${mime};base64,${bytes.toString('base64')}`, label: undefined };
}

function readFrame(el: Element): SlideShape | undefined {
  const isGroup = el.tagName === 'p:grpSp';
  const cNvPr = isGroup ? path(el, 'p:nvGrpSpPr', 'p:cNvPr') : path(el, 'p:nvGraphicFramePr', 'p:cNvPr');
  const id = cNvPr?.getAttribute('id');
  const box = readXfrm(isGroup ? path(el, 'p:grpSpPr', 'a:xfrm') : child(el, 'p:xfrm'));
  if (!id || !box) return undefined;
  const uri = path(el, 'a:graphic', 'a:graphicData')?.getAttribute('uri') ?? '';
  const label = isGroup ? 'Group' : uri.endsWith('/table') ? 'Table' : uri.endsWith('/chart') ? 'Chart' : 'Object';
  return {
    id,
    name: cNvPr?.getAttribute('name') ?? label,
    kind: 'unsupported',
    geometry: 'rect',
    ...box,
    valign: 'ctr',
    defaultSize: 14,
    defaultColor: '666666',
    paragraphs: [],
    label,
  };
}

async function readSlideContext(pkg: PptxPackage, slidePath: string): Promise<SlideContext> {
  const layoutRel = (await pkg.relationships(slidePath)).find((r) => r.type === REL_TYPE.layout);
  if (!layoutRel) return {};
  const layoutPath = resolveTarget(slidePath, layoutRel.target);
  const masterRel = (await pkg.relationships(layoutPath)).find((r) => r.type === REL_TYPE.master);
  return {
    layout: await pkg.xml(layoutPath),
    master: masterRel ? await pkg.xml(resolveTarget(layoutPath, masterRel.target)) : undefined,
  };
}

/** Reads the deck into a flat, render-ready model: positions in px, text with run formatting. */
export async function readDeck(pkg: PptxPackage): Promise<Deck> {
  const presentation = await pkg.requireXml('ppt/presentation.xml');
  const size = presentation.getElementsByTagName('p:sldSz')[0];
  const theme = await readTheme(pkg);

  const slides: Slide[] = [];
  for (const [index, { partPath }] of (await pkg.slides()).entries()) {
    const doc = await pkg.requireXml(partPath);
    const ctx = await readSlideContext(pkg, partPath);
    const root = path(doc, 'p:sld', 'p:cSld');
    const bgOf = (holder: Document | undefined, rootName: string) =>
      colorIn(path(holder, rootName, 'p:cSld', 'p:bg', 'p:bgPr', 'a:solidFill'), theme);
    const background = colorIn(path(root, 'p:bg', 'p:bgPr', 'a:solidFill'), theme) ?? bgOf(ctx.layout, 'p:sldLayout') ?? bgOf(ctx.master, 'p:sldMaster');

    const shapes: SlideShape[] = [];
    for (let node = path(root, 'p:spTree')?.firstChild; node; node = node.nextSibling) {
      if (node.nodeType !== 1) continue;
      const el = node as Element;
      let shape: SlideShape | undefined;
      if (el.tagName === 'p:sp') shape = readSp(el, ctx, theme);
      else if (el.tagName === 'p:pic') shape = await readPic(pkg, partPath, el);
      else if (el.tagName === 'p:graphicFrame' || el.tagName === 'p:grpSp') shape = readFrame(el);
      if (shape) shapes.push(shape);
    }
    slides.push({ index, background: background ?? 'FFFFFF', shapes });
  }

  return { width: px(size?.getAttribute('cx') ?? '9144000'), height: px(size?.getAttribute('cy') ?? '5143500'), slides };
}
