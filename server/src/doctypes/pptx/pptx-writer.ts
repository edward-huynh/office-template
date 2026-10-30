import type { SlideEdits, SlideParagraph, SlideRun } from '../../contracts/index.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { child, children, NS, PptxPackage, REL_TYPE, readRelationships, relsPathOf, resolveTarget, serializeXml } from './xml.js';

const CONTENT_TYPES = '[Content_Types].xml';
const SLIDE_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml';

/** XML 1.0 forbids most control characters; PowerPoint refuses files that contain them. */
const stripInvalidXml = (text: string) => text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');

/** Formatting a run falls back to: the paragraph's `a:endParaRPr`, which is where an empty box keeps its look. */
interface RunFallback {
  size?: number;
  bold?: boolean;
  color?: string;
  font?: string;
}

function fallbackOf(template: Element | undefined): RunFallback {
  const end = child(template, 'a:endParaRPr');
  if (!end) return {};
  const size = end.getAttribute('sz');
  const color = child(child(end, 'a:solidFill'), 'a:srgbClr')?.getAttribute('val');
  return {
    size: size ? Number(size) / 100 : undefined,
    bold: end.getAttribute('b') === null ? undefined : end.getAttribute('b') === '1',
    color: color ?? undefined,
    font: child(end, 'a:latin')?.getAttribute('typeface') ?? undefined,
  };
}

function buildRun(doc: Document, input: SlideRun, fallback: RunFallback = {}): Element {
  const run: SlideRun = {
    ...input,
    size: input.size ?? fallback.size,
    bold: input.bold ?? fallback.bold,
    color: input.color ?? fallback.color,
    font: input.font ?? fallback.font,
  };
  const r = doc.createElementNS(NS.a, 'a:r');
  const rPr = doc.createElementNS(NS.a, 'a:rPr');
  rPr.setAttribute('lang', 'en-US');
  if (run.size !== undefined) rPr.setAttribute('sz', String(Math.round(run.size * 100)));
  if (run.bold !== undefined) rPr.setAttribute('b', run.bold ? '1' : '0');
  if (run.italic !== undefined) rPr.setAttribute('i', run.italic ? '1' : '0');
  if (run.underline !== undefined) rPr.setAttribute('u', run.underline ? 'sng' : 'none');
  rPr.setAttribute('dirty', '0');
  if (run.color) {
    const fill = doc.createElementNS(NS.a, 'a:solidFill');
    const srgb = doc.createElementNS(NS.a, 'a:srgbClr');
    srgb.setAttribute('val', run.color.toUpperCase());
    fill.appendChild(srgb);
    rPr.appendChild(fill);
  }
  if (run.font) {
    const latin = doc.createElementNS(NS.a, 'a:latin');
    latin.setAttribute('typeface', run.font.replace(/[<>&"]/g, ''));
    rPr.appendChild(latin);
  }
  r.appendChild(rPr);
  const t = doc.createElementNS(NS.a, 'a:t');
  t.appendChild(doc.createTextNode(stripInvalidXml(run.text)));
  r.appendChild(t);
  return r;
}

/** Schema order inside `a:pPr`: the bullet choice must come before tab stops and default run properties. */
function setBullet(doc: Document, pPr: Element, bullet: boolean) {
  for (const name of ['a:buNone', 'a:buChar', 'a:buAutoNum']) for (const el of children(pPr, name)) pPr.removeChild(el);
  const marker = doc.createElementNS(NS.a, bullet ? 'a:buChar' : 'a:buNone');
  if (bullet) {
    marker.setAttribute('char', '•');
    if (!pPr.getAttribute('marL')) pPr.setAttribute('marL', '285750');
    if (!pPr.getAttribute('indent')) pPr.setAttribute('indent', '-285750');
  }
  const anchor = ['a:tabLst', 'a:defRPr', 'a:extLst'].map((name) => child(pPr, name)).find(Boolean);
  pPr.insertBefore(marker, anchor ?? null);
}

function buildParagraph(doc: Document, paragraph: SlideParagraph, template: Element | undefined): Element {
  const p = doc.createElementNS(NS.a, 'a:p');
  const pPr = (child(template, 'a:pPr')?.cloneNode(true) as Element | undefined) ?? doc.createElementNS(NS.a, 'a:pPr');
  if (paragraph.align) pPr.setAttribute('algn', paragraph.align);
  if (paragraph.bullet !== undefined) {
    const has = Boolean(child(pPr, 'a:buChar') || child(pPr, 'a:buAutoNum'));
    const none = Boolean(child(pPr, 'a:buNone'));
    // Rewrite only when the stated state differs from what the paragraph already declares.
    if ((paragraph.bullet && !has) || (!paragraph.bullet && (has || !none))) setBullet(doc, pPr, paragraph.bullet);
  }
  if (pPr.attributes.length > 0 || pPr.firstChild) p.appendChild(pPr);

  // Only an empty template paragraph lends its end-of-paragraph formatting to new text.
  const fallback = template && !child(template, 'a:r') ? fallbackOf(template) : {};
  for (const run of paragraph.runs) {
    const parts = run.text.split('\n');
    parts.forEach((part, index) => {
      if (index > 0) p.appendChild(doc.createElementNS(NS.a, 'a:br'));
      if (part !== '') p.appendChild(buildRun(doc, { ...run, text: part }, fallback));
    });
  }
  const end = child(template, 'a:endParaRPr');
  if (end) p.appendChild(end.cloneNode(true));
  return p;
}

function replaceParagraphs(doc: Document, txBody: Element, paragraphs: SlideParagraph[]) {
  const existing = children(txBody, 'a:p');
  const fresh = (paragraphs.length ? paragraphs : [{ runs: [] }]).map((paragraph, i) =>
    buildParagraph(doc, paragraph, existing[i] ?? existing[existing.length - 1]),
  );
  for (const old of existing) txBody.removeChild(old);
  for (const p of fresh) txBody.appendChild(p);
}

/** Applies text edits to the listed shapes only; every other byte of the slide XML is left alone. */
export async function applyEdits(pkg: PptxPackage, edits: SlideEdits): Promise<void> {
  const slides = await pkg.slides();
  for (const edit of edits.slides) {
    const slide = slides[edit.index];
    if (!slide) throw ApiError.badRequest(`Slide ${edit.index + 1} does not exist`);
    const doc = await pkg.requireXml(slide.partPath);
    const shapes = new Map<string, Element>();
    for (const sp of Array.from(doc.getElementsByTagName('p:sp'))) {
      const id = child(child(sp, 'p:nvSpPr'), 'p:cNvPr')?.getAttribute('id');
      if (id) shapes.set(id, sp);
    }
    for (const shapeEdit of edit.shapes) {
      const txBody = child(shapes.get(shapeEdit.id), 'p:txBody');
      if (!txBody) throw ApiError.badRequest(`Shape ${shapeEdit.id} on slide ${edit.index + 1} has no editable text`);
      replaceParagraphs(doc, txBody, shapeEdit.paragraphs);
    }
  }
}

const slideNumber = (path: string) => Number(/slide(\d+)\.xml$/.exec(path)?.[1] ?? 0);

/** Duplicates a slide and places the copy right after it. */
export async function duplicateSlide(pkg: PptxPackage, index: number): Promise<void> {
  const slides = await pkg.slides();
  const source = slides[index];
  if (!source) throw ApiError.badRequest(`Slide ${index + 1} does not exist`);

  const number = Math.max(0, ...slides.map((s) => slideNumber(s.partPath)), ...Object.keys(pkg.zip.files).map(slideNumber)) + 1;
  const newPath = `ppt/slides/slide${number}.xml`;
  pkg.zip.file(newPath, await pkg.zip.file(source.partPath)!.async('string'));

  // Copy the slide's relationships, leaving out speaker notes (a notes page belongs to exactly one slide).
  const relsEntry = pkg.zip.file(relsPathOf(source.partPath));
  if (relsEntry) {
    const relsDoc = (await pkg.xml(relsPathOf(source.partPath)))!;
    const copy = relsDoc.cloneNode(true) as Document;
    for (const rel of Array.from(copy.getElementsByTagName('Relationship'))) {
      if (rel.getAttribute('Type') === REL_TYPE.notes) rel.parentNode?.removeChild(rel);
    }
    pkg.zip.file(relsPathOf(newPath), serializeXml(copy));
  }

  const types = await pkg.requireXml(CONTENT_TYPES);
  const override = types.createElementNS(types.documentElement.namespaceURI, 'Override');
  override.setAttribute('PartName', `/${newPath}`);
  override.setAttribute('ContentType', SLIDE_CONTENT_TYPE);
  types.documentElement.appendChild(override);

  const presRels = await pkg.requireXml('ppt/_rels/presentation.xml.rels');
  const used = new Set(readRelationships(presRels).map((r) => r.id));
  let relNumber = 1;
  while (used.has(`rId${relNumber}`)) relNumber += 1;
  const relId = `rId${relNumber}`;
  const rel = presRels.createElementNS(presRels.documentElement.namespaceURI, 'Relationship');
  rel.setAttribute('Id', relId);
  rel.setAttribute('Type', REL_TYPE.slide);
  rel.setAttribute('Target', `slides/slide${number}.xml`);
  presRels.documentElement.appendChild(rel);

  const presentation = await pkg.requireXml('ppt/presentation.xml');
  const ids = Array.from(presentation.getElementsByTagName('p:sldId'));
  const nextId = Math.max(255, ...ids.map((el) => Number(el.getAttribute('id') ?? 0))) + 1;
  const sourceEl = ids.find((el) => el.getAttribute('r:id') === source.relId)!;
  const entry = presentation.createElementNS(sourceEl.namespaceURI, 'p:sldId');
  entry.setAttribute('id', String(nextId));
  entry.setAttributeNS(NS.r, 'r:id', relId);
  sourceEl.parentNode!.insertBefore(entry, sourceEl.nextSibling);
}

/** Removes a slide (and its notes page). The last remaining slide cannot be deleted. */
export async function deleteSlide(pkg: PptxPackage, index: number): Promise<void> {
  const slides = await pkg.slides();
  const target = slides[index];
  if (!target) throw ApiError.badRequest(`Slide ${index + 1} does not exist`);
  if (slides.length <= 1) throw ApiError.badRequest('A presentation needs at least one slide');

  const presentation = await pkg.requireXml('ppt/presentation.xml');
  for (const el of Array.from(presentation.getElementsByTagName('p:sldId'))) {
    if (el.getAttribute('r:id') === target.relId) el.parentNode?.removeChild(el);
  }
  const presRels = await pkg.requireXml('ppt/_rels/presentation.xml.rels');
  for (const el of Array.from(presRels.getElementsByTagName('Relationship'))) {
    if (el.getAttribute('Id') === target.relId) el.parentNode?.removeChild(el);
  }

  const doomed = [target.partPath, relsPathOf(target.partPath)];
  for (const rel of await pkg.relationships(target.partPath)) {
    if (rel.type === REL_TYPE.notes) {
      const notesPath = resolveTarget(target.partPath, rel.target);
      doomed.push(notesPath, relsPathOf(notesPath));
    }
  }
  const types = await pkg.requireXml(CONTENT_TYPES);
  for (const el of Array.from(types.getElementsByTagName('Override'))) {
    const part = (el.getAttribute('PartName') ?? '').replace(/^\//, '');
    if (doomed.includes(part)) el.parentNode?.removeChild(el);
  }
  for (const part of doomed) pkg.zip.remove(part);
}
