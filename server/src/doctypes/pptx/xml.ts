import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { ApiError } from '../../shared/errors/api-error.js';

export const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
} as const;

export const REL_TYPE = {
  slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
  layout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
  master: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
  image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  notes: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide',
} as const;

export const parseXml = (xml: string): Document => new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document;
export const serializeXml = (doc: Document): string => new XMLSerializer().serializeToString(doc as never);

/** Direct child elements with the given qualified name. */
export function children(parent: Element | Document | null | undefined, name: string): Element[] {
  const out: Element[] = [];
  if (!parent) return out;
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1 && (node as Element).tagName === name) out.push(node as Element);
  }
  return out;
}

export const child = (parent: Element | Document | null | undefined, name: string): Element | undefined =>
  children(parent, name)[0];

/** Follows a path of qualified names, for example `path(sp, 'p:nvSpPr', 'p:cNvPr')`. */
export function path(start: Element | Document | null | undefined, ...names: string[]): Element | undefined {
  let current: Element | Document | undefined = start ?? undefined;
  for (const name of names) {
    current = child(current, name);
    if (!current) return undefined;
  }
  return current as Element;
}

export interface Relationship {
  id: string;
  type: string;
  target: string;
}

export function readRelationships(doc: Document | undefined): Relationship[] {
  if (!doc) return [];
  return Array.from(doc.getElementsByTagName('Relationship')).map((el) => ({
    id: el.getAttribute('Id') ?? '',
    type: el.getAttribute('Type') ?? '',
    target: el.getAttribute('Target') ?? '',
  }));
}

/** Resolves a relationship target against the folder of the part that owns it. */
export function resolveTarget(ownerPath: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = ownerPath.split('/').slice(0, -1);
  for (const segment of target.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment !== '.') parts.push(segment);
  }
  return parts.join('/');
}

export const relsPathOf = (partPath: string) => {
  const slash = partPath.lastIndexOf('/');
  return `${partPath.slice(0, slash)}/_rels/${partPath.slice(slash + 1)}.rels`;
};

/** An opened PPTX with cached, parsed XML parts. */
export class PptxPackage {
  private readonly cache = new Map<string, Document>();
  private constructor(readonly zip: JSZip) {}

  static async open(file: Buffer): Promise<PptxPackage> {
    try {
      return new PptxPackage(await JSZip.loadAsync(file));
    } catch {
      throw ApiError.unsupportedMediaType('The file is not a valid PPTX document');
    }
  }

  async xml(partPath: string): Promise<Document | undefined> {
    const cached = this.cache.get(partPath);
    if (cached) return cached;
    const entry = this.zip.file(partPath);
    if (!entry) return undefined;
    const doc = parseXml(await entry.async('string'));
    this.cache.set(partPath, doc);
    return doc;
  }

  async requireXml(partPath: string): Promise<Document> {
    const doc = await this.xml(partPath);
    if (!doc) throw ApiError.unsupportedMediaType(`The PPTX is missing ${partPath}`);
    return doc;
  }

  async relationships(partPath: string): Promise<Relationship[]> {
    return readRelationships(await this.xml(relsPathOf(partPath)));
  }

  /** Serializes every part that was parsed (and possibly modified) and returns the package bytes. */
  async toBuffer(): Promise<Buffer> {
    for (const [partPath, doc] of this.cache) this.zip.file(partPath, serializeXml(doc));
    return this.zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  /** Ordered slides as `{ partPath, relId }`. */
  async slides(): Promise<Array<{ partPath: string; relId: string }>> {
    const presentation = await this.requireXml('ppt/presentation.xml');
    const rels = await this.relationships('ppt/presentation.xml');
    const out: Array<{ partPath: string; relId: string }> = [];
    for (const sldId of Array.from(presentation.getElementsByTagName('p:sldId'))) {
      const relId = sldId.getAttribute('r:id') ?? '';
      const rel = rels.find((r) => r.id === relId && r.type === REL_TYPE.slide);
      if (rel) out.push({ partPath: resolveTarget('ppt/presentation.xml', rel.target), relId });
    }
    return out;
  }
}
