import { randomUUID } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import type {
  Deck,
  DocType,
  EditorContent,
  OfficeDocument,
  RenameDocumentInput,
  SlideEdits,
  UpdateDocumentInput,
} from '../../contracts/index.js';
import { getHandler } from '../../doctypes/registry.js';
import type { DocTypeHandler } from '../../doctypes/types.js';
import type { DocumentRow } from '../../infra/db/schema.js';
import { copyBetween, type FileStore, type ReadableStore } from '../../infra/storage/file-store.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { templatePreviewUrls, templateThumbnailUrl, type TemplatesService } from '../templates/templates.service.js';
import type { DocumentsRepository } from './documents.repository.js';

export interface DocumentDownload {
  stream: ReadStream;
  size: number;
  mimeType: string;
  fileName: string;
}

export class DocumentsService {
  /**
   * `templateStore` is deliberately a read-only view: this service has no way to modify a
   * template file. All writes go to `documentStore`.
   */
  constructor(
    private readonly repository: DocumentsRepository,
    private readonly templates: TemplatesService,
    private readonly templateStore: ReadableStore,
    private readonly documentStore: FileStore,
    /** Where document type handlers come from: direct calls, or the worker pool (see `pooledHandlers`). */
    private readonly handlers: (type: DocType) => DocTypeHandler = getHandler,
  ) {}

  /** Copy-on-use: creates a new document from a copy of the template file. */
  async useTemplate(templateId: string, ownerSessionId: string): Promise<{ id: string }> {
    const template = this.templates.getRow(templateId);
    const handler = this.handlers(template.type);

    const id = randomUUID();
    const key = `${id}.${handler.extension}`;
    const sizeBytes = await copyBetween(this.templateStore, template.filePath, this.documentStore, key);

    const now = new Date().toISOString();
    this.repository.insert({
      id,
      templateId: template.id,
      templateVersion: template.version,
      type: template.type,
      title: template.name,
      ownerSessionId,
      filePath: key,
      sizeBytes,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  }

  list(ownerSessionId: string, limit?: number): OfficeDocument[] {
    return this.repository.listByOwner(ownerSessionId, limit).map((row) => this.toDto(row));
  }

  /** Renames the document only: the file and its content are untouched. */
  rename(id: string, ownerSessionId: string, input: RenameDocumentInput): OfficeDocument {
    const row = this.getOwned(id, ownerSessionId);
    const patch = { title: input.title, updatedAt: new Date().toISOString() };
    this.repository.update(row.id, patch);
    return this.toDto({ ...row, ...patch });
  }

  get(id: string, ownerSessionId: string): OfficeDocument {
    return this.toDto(this.getOwned(id, ownerSessionId));
  }

  async getContent(id: string, ownerSessionId: string): Promise<EditorContent> {
    const row = this.getOwned(id, ownerSessionId);
    const handler = this.handlers(row.type);
    if (!handler.toEditorContent) {
      throw ApiError.badRequest(`${row.type.toUpperCase()} documents have no in-app editor`);
    }
    // Once saved from the editor, the editor's own HTML is the source of truth for editing: converting
    // the DOCX back to HTML would drop formatting (fonts, colours) the DOCX writer cannot round-trip.
    return (await this.readEditorState(row)) ?? handler.toEditorContent(await this.documentStore.read(row.filePath));
  }

  /** Overwrites the document copy. The template the copy came from is never touched. */
  async updateContent(id: string, ownerSessionId: string, input: UpdateDocumentInput): Promise<OfficeDocument> {
    const row = this.getOwned(id, ownerSessionId);
    const handler = this.handlers(row.type);
    if (!handler.fromEditorContent || !handler.toEditorContent) {
      throw ApiError.badRequest(`${row.type.toUpperCase()} documents have no in-app editor`);
    }
    const defaults =
      (await this.readEditorState(row))?.defaults ??
      (await handler.toEditorContent(await this.documentStore.read(row.filePath))).defaults;
    // Conversion, sanitizing and validation all run in the handler (in the worker thread when pooled).
    const { file, html } = await handler.fromEditorContent({ html: input.html });
    await handler.validate(file);
    await this.documentStore.write(row.filePath, file);
    await this.documentStore.write(editorStateKey(row), Buffer.from(JSON.stringify({ html, defaults })));

    const patch = {
      title: input.title ?? row.title,
      sizeBytes: file.byteLength,
      updatedAt: new Date().toISOString(),
    };
    this.repository.update(row.id, patch);
    return this.toDto({ ...row, ...patch });
  }

  // ------------------------------------------------------------------ slides (PPTX)

  async getSlides(id: string, ownerSessionId: string): Promise<Deck> {
    const { row, handler } = this.slideContext(id, ownerSessionId);
    return handler.readSlides!(await this.documentStore.read(row.filePath));
  }

  /** Text edits only; untouched shapes keep their original XML. */
  async updateSlides(id: string, ownerSessionId: string, edits: SlideEdits): Promise<OfficeDocument> {
    const updated = await this.rewrite(id, ownerSessionId, (handler, file) => handler.applySlideEdits!(file, edits));
    if (!edits.title) return updated;
    this.repository.update(id, { title: edits.title });
    return { ...updated, title: edits.title };
  }

  async duplicateSlide(id: string, ownerSessionId: string, index: number): Promise<Deck> {
    await this.rewrite(id, ownerSessionId, (handler, file) => handler.duplicateSlide!(file, index));
    return this.getSlides(id, ownerSessionId);
  }

  async deleteSlide(id: string, ownerSessionId: string, index: number): Promise<Deck> {
    await this.rewrite(id, ownerSessionId, (handler, file) => handler.deleteSlide!(file, index));
    return this.getSlides(id, ownerSessionId);
  }

  private slideContext(id: string, ownerSessionId: string) {
    const row = this.getOwned(id, ownerSessionId);
    const handler = this.handlers(row.type);
    if (!handler.readSlides) throw ApiError.badRequest(`${row.type.toUpperCase()} documents have no slides`);
    return { row, handler };
  }

  /** Runs a file transformation, validates the result, and overwrites the document copy. */
  private async rewrite(
    id: string,
    ownerSessionId: string,
    transform: (handler: DocTypeHandler, file: Buffer) => Promise<Buffer>,
  ): Promise<OfficeDocument> {
    const { row, handler } = this.slideContext(id, ownerSessionId);
    const file = await transform(handler, await this.documentStore.read(row.filePath));
    await handler.validate(file);
    await this.documentStore.write(row.filePath, file);
    const patch = { sizeBytes: file.byteLength, updatedAt: new Date().toISOString() };
    this.repository.update(row.id, patch);
    return this.toDto({ ...row, ...patch });
  }

  async download(id: string, ownerSessionId: string): Promise<DocumentDownload> {
    const row = this.getOwned(id, ownerSessionId);
    const handler = this.handlers(row.type);
    const { size } = await this.documentStore.stat(row.filePath);
    return {
      stream: this.documentStore.openStream(row.filePath),
      size,
      mimeType: handler.mimeType,
      fileName: `${safeFileName(row.title)}.${handler.extension}`,
    };
  }

  private async readEditorState(row: DocumentRow): Promise<EditorContent | undefined> {
    const key = editorStateKey(row);
    if (!(await this.documentStore.exists(key))) return undefined;
    try {
      const saved = JSON.parse((await this.documentStore.read(key)).toString()) as EditorContent;
      // Written only by `updateContent` after sanitizing, so it is not sanitized again on every open.
      return { html: saved.html, defaults: saved.defaults };
    } catch {
      return undefined; // unreadable sidecar: fall back to converting the DOCX
    }
  }

  private getOwned(id: string, ownerSessionId: string): DocumentRow {
    const row = this.repository.findOwned(id, ownerSessionId);
    if (!row) throw ApiError.notFound('Document was not found');
    return row;
  }

  private toDto(row: DocumentRow): OfficeDocument {
    const template = this.templates.getRow(row.templateId);
    return {
      id: row.id,
      templateId: row.templateId,
      templateVersion: row.templateVersion,
      type: row.type,
      title: row.title,
      sizeBytes: row.sizeBytes,
      thumbnailUrl: templateThumbnailUrl(template),
      previewUrls: templatePreviewUrls(template),
      downloadUrl: `/api/documents/${row.id}/download`,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

const editorStateKey = (row: Pick<DocumentRow, 'id'>) => `${row.id}.editor.json`;

function safeFileName(title: string): string {
  const cleaned = title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/\s+/g, '-');
  return cleaned.slice(0, 80) || 'document';
}
