import { createHash } from 'node:crypto';
import type { DocType } from '../../contracts/index.js';
import { getHandler } from '../../doctypes/registry.js';
import type { FileStore } from '../../infra/storage/file-store.js';
import type { PreviewImage } from '../../infra/preview/preview-generator.js';
import type { TemplateRow } from '../../infra/db/schema.js';
import type { TemplatesRepository } from './templates.repository.js';

export interface ImportInput {
  id: string;
  type: DocType;
  name: string;
  category: string;
  description: string;
  hidden?: boolean;
  file: Buffer;
  thumbnail: PreviewImage;
  pages: PreviewImage[];
}

export type ImportStatus = 'created' | 'updated' | 'unchanged';

/**
 * The only writer of the managed template store. Used by `pnpm seed` and by admin uploads, so a
 * template added either way is stored and versioned identically. Documents never go through here.
 */
export class TemplateImporter {
  constructor(
    private readonly repository: TemplatesRepository,
    private readonly templateStore: FileStore,
  ) {}

  async import(input: ImportInput): Promise<{ status: ImportStatus; row: TemplateRow }> {
    const handler = getHandler(input.type);
    await handler.validate(input.file);

    const checksum = createHash('sha256').update(input.file).digest('hex');
    const existing = this.repository.findById(input.id);

    const base = `${input.type}/${input.id}`;
    const fileKey = `${base}/template.${handler.extension}`;
    const thumbnailKey = `${base}/thumbnail.${input.thumbnail.extension}`;
    const pageKeys = input.pages.map((page, index) => `${base}/pages/${index + 1}.${page.extension}`);

    const previewsChanged =
      !existing ||
      existing.thumbnailPath !== thumbnailKey ||
      JSON.stringify(existing.previewPages) !== JSON.stringify(pageKeys);
    const contentChanged = !existing || existing.checksum !== checksum;
    const metadataChanged =
      !existing ||
      existing.name !== input.name ||
      existing.category !== input.category ||
      existing.description !== input.description ||
      existing.hidden !== Boolean(input.hidden);

    if (existing && !contentChanged && !previewsChanged && !metadataChanged) {
      // Previews are regenerated only when something changed, so re-seeding is cheap and idempotent.
      return { status: 'unchanged', row: existing };
    }

    await this.templateStore.write(fileKey, input.file);
    await this.templateStore.write(thumbnailKey, input.thumbnail.data);
    await Promise.all(pageKeys.map((key, index) => this.templateStore.write(key, input.pages[index]!.data)));
    // Drop preview pages that no longer exist after a re-import.
    for (const stale of existing?.previewPages ?? []) {
      if (!pageKeys.includes(stale)) await this.templateStore.remove(stale);
    }

    const now = new Date().toISOString();
    const row: TemplateRow = {
      id: input.id,
      type: input.type,
      name: input.name,
      category: input.category,
      description: input.description,
      version: existing ? (contentChanged ? existing.version + 1 : existing.version) : 1,
      hidden: Boolean(input.hidden),
      filePath: fileKey,
      thumbnailPath: thumbnailKey,
      previewPages: pageKeys,
      checksum,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.repository.upsert(row);
    return { status: existing ? 'updated' : 'created', row };
  }
}
