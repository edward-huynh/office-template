import type { Deck, DocType, SlideEdits } from '../contracts/index.js';

export interface EditorContent {
  html: string;
  /** Body font of the source document, so the editor page can look like it. */
  defaults?: { fontFamily?: string; fontSize?: number };
}

/**
 * One implementation per supported Office format. Services depend on this interface through the
 * registry and never branch on the document type.
 */
export interface DocTypeHandler {
  readonly type: DocType;
  readonly mimeType: string;
  readonly extension: string;
  /** Hint for the client: a word-processor editor or a slide editor. */
  readonly editor: 'richtext' | 'slides';
  /** Throws `ApiError` when the buffer is not a valid file of this type. */
  validate(file: Buffer): Promise<void>;

  /** Rich-text types: the document as editor HTML, and back. */
  toEditorContent?(file: Buffer): Promise<EditorContent>;
  /** Returns the DOCX and the sanitized HTML it was built from (kept so the editor can reopen it losslessly). */
  fromEditorContent?(content: EditorContent): Promise<{ file: Buffer; html: string }>;

  /** Slide types: a render-ready model, and operations that return the modified file. */
  readSlides?(file: Buffer): Promise<Deck>;
  applySlideEdits?(file: Buffer, edits: SlideEdits): Promise<Buffer>;
  duplicateSlide?(file: Buffer, index: number): Promise<Buffer>;
  deleteSlide?(file: Buffer, index: number): Promise<Buffer>;
}
