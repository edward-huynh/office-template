import fs from 'node:fs/promises';
import path from 'node:path';
import { manifestSchema, type TemplateManifest } from '../../contracts/index.js';
import type { PreviewImage } from '../../infra/preview/preview-generator.js';
import type { ImportInput } from './template-importer.js';

export interface CatalogEntry {
  dir: string;
  manifest: TemplateManifest;
}

/** Resolves a manifest-relative path, refusing anything that escapes the template folder. */
function resolveInside(dir: string, relative: string): string {
  const resolved = path.resolve(dir, relative);
  const rel = path.relative(dir, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path "${relative}" escapes the template folder`);
  }
  return resolved;
}

function imageFromFile(relative: string, data: Buffer): PreviewImage {
  const extension = path.extname(relative).toLowerCase();
  if (extension !== '.png' && extension !== '.svg') {
    throw new Error(`Preview "${relative}" must be a .png or .svg file`);
  }
  return { data, extension: extension === '.svg' ? 'svg' : 'png' };
}

/** Finds every `<catalog>/<type>/<slug>/manifest.json` and validates it. Invalid manifests throw. */
export async function loadCatalog(catalogDir: string): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = [];
  const types = await fs.readdir(catalogDir, { withFileTypes: true }).catch(() => []);
  for (const typeDir of types.filter((d) => d.isDirectory())) {
    const templates = await fs.readdir(path.join(catalogDir, typeDir.name), { withFileTypes: true });
    for (const templateDir of templates.filter((d) => d.isDirectory())) {
      const dir = path.join(catalogDir, typeDir.name, templateDir.name);
      const raw = await fs.readFile(path.join(dir, 'manifest.json'), 'utf8').catch(() => undefined);
      if (raw === undefined) continue;
      const parsed = manifestSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        throw new Error(`Invalid manifest in ${dir}: ${parsed.error.message}`);
      }
      if (parsed.data.id !== templateDir.name || parsed.data.type !== typeDir.name) {
        throw new Error(`Manifest in ${dir} must match its folder (<type>/<id>)`);
      }
      entries.push({ dir, manifest: parsed.data });
    }
  }
  return entries;
}

/** Reads the files referenced by a manifest and returns the importer input. */
export async function readCatalogEntry({ dir, manifest }: CatalogEntry): Promise<ImportInput> {
  const read = (relative: string) => fs.readFile(resolveInside(dir, relative));
  return {
    id: manifest.id,
    type: manifest.type,
    name: manifest.name,
    category: manifest.category,
    description: manifest.description,
    hidden: manifest.hidden,
    file: await read(manifest.file),
    thumbnail: imageFromFile(manifest.thumbnail, await read(manifest.thumbnail)),
    pages: await Promise.all(manifest.previews.map(async (p) => imageFromFile(p, await read(p)))),
  };
}
