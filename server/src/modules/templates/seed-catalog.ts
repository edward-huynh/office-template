import { loadCatalog, readCatalogEntry } from './manifest-loader.js';
import type { ImportStatus, TemplateImporter } from './template-importer.js';
import type { TemplateRow } from '../../infra/db/schema.js';

export interface SeedResult {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: Array<{ id: string; message: string }>;
}

/**
 * Imports the manifest-driven catalog (`server/templates`) into the managed template store and the
 * database. Idempotent: templates that are already imported and unchanged are skipped, changed ones
 * get a new version. Used by `pnpm seed` and automatically when the server starts.
 */
export async function seedCatalog(
  importer: TemplateImporter,
  catalogDir: string,
  onEntry?: (status: ImportStatus, row: TemplateRow) => void,
): Promise<SeedResult> {
  const entries = await loadCatalog(catalogDir);
  const result: SeedResult = { total: entries.length, created: 0, updated: 0, unchanged: 0, failed: [] };
  for (const entry of entries) {
    try {
      const { status, row } = await importer.import(await readCatalogEntry(entry));
      result[status] += 1;
      onEntry?.(status, row);
    } catch (error) {
      result.failed.push({ id: `${entry.manifest.type}/${entry.manifest.id}`, message: (error as Error).message });
    }
  }
  return result;
}
