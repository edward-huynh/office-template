import type { ReadStream } from 'node:fs';
import path from 'node:path';
import type { Template, TemplateList, TemplateListQuery } from '../../contracts/index.js';
import type { TemplateRow } from '../../infra/db/schema.js';
import type { ReadableStore } from '../../infra/storage/file-store.js';
import { ApiError } from '../../shared/errors/api-error.js';
import type { TemplatesRepository } from './templates.repository.js';

export interface TemplateAsset {
  stream: ReadStream;
  contentType: string;
  size: number;
  etag: string;
}

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

/** URL helpers keep the asset URL format in one place. `v` busts caches when a template changes. */
export const templateThumbnailUrl = (row: Pick<TemplateRow, 'id' | 'checksum'>) =>
  `/api/templates/${row.id}/thumbnail?v=${row.checksum.slice(0, 8)}`;

export const templatePreviewUrls = (row: Pick<TemplateRow, 'id' | 'checksum' | 'previewPages'>) =>
  row.previewPages.map((_, index) => `/api/templates/${row.id}/pages/${index}?v=${row.checksum.slice(0, 8)}`);

export function toTemplateDto(row: TemplateRow): Template {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    category: row.category,
    description: row.description,
    version: row.version,
    thumbnailUrl: templateThumbnailUrl(row),
    previewUrls: templatePreviewUrls(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class TemplatesService {
  constructor(
    private readonly repository: TemplatesRepository,
    private readonly templateStore: ReadableStore,
  ) {}

  list(query: TemplateListQuery): TemplateList {
    const { rows, total } = this.repository.list(query);
    return {
      items: rows.map(toTemplateDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
      categories: this.repository.categories(query.type),
    };
  }

  get(id: string): Template {
    return toTemplateDto(this.getRow(id));
  }

  getRow(id: string): TemplateRow {
    const row = this.repository.findById(id);
    if (!row) throw ApiError.notFound(`Template "${id}" was not found`);
    return row;
  }

  async getThumbnail(id: string): Promise<TemplateAsset> {
    const row = this.getRow(id);
    return this.openAsset(row, row.thumbnailPath);
  }

  async getPreviewPage(id: string, index: number): Promise<TemplateAsset> {
    const row = this.getRow(id);
    const key = row.previewPages[index];
    if (!key) throw ApiError.notFound(`Preview page ${index} was not found`);
    return this.openAsset(row, key);
  }

  private async openAsset(row: TemplateRow, key: string): Promise<TemplateAsset> {
    const { size } = await this.templateStore.stat(key).catch(() => {
      throw ApiError.notFound('Preview asset was not found');
    });
    return {
      stream: this.templateStore.openStream(key),
      contentType: CONTENT_TYPES[path.extname(key).toLowerCase()] ?? 'application/octet-stream',
      size,
      etag: `"${row.checksum.slice(0, 16)}-${path.basename(key)}"`,
    };
  }
}
