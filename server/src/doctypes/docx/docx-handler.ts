import HTMLtoDOCX from '@turbodocx/html-to-docx';
import mammoth from 'mammoth';
import { sanitizeEditorHtml } from '../../shared/utils/sanitize-html.js';
import { assertOpenXmlPackage } from '../open-xml.js';
import type { DocTypeHandler, EditorContent } from '../types.js';
import { applyHeadingStyles, readDocxStyles } from './docx-styles.js';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const docxHandler: DocTypeHandler = {
  type: 'docx',
  mimeType: DOCX_MIME,
  extension: 'docx',
  editor: 'richtext',

  async validate(file) {
    await assertOpenXmlPackage(file, ['[Content_Types].xml', 'word/document.xml'], 'DOCX');
  },

  async toEditorContent(file): Promise<EditorContent> {
    const [result, styles] = await Promise.all([
      mammoth.convertToHtml({ buffer: file }, { styleMap: ['u => u', 'strike => s'] }),
      readDocxStyles(file),
    ]);
    return {
      html: sanitizeEditorHtml(applyHeadingStyles(result.value, styles.headings)),
      defaults: styles.defaults,
    };
  },

  async fromEditorContent({ html }) {
    const safe = sanitizeEditorHtml(html);
    const document = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${safe}</body></html>`;
    const output = await HTMLtoDOCX(document, undefined, {
      table: { row: { cantSplit: true } },
      footer: false,
      pageNumber: false,
    });
    const file = Buffer.isBuffer(output)
      ? output
      : output instanceof ArrayBuffer
        ? Buffer.from(output)
        : Buffer.from(await (output as Blob).arrayBuffer());
    return { file, html: safe };
  },
};
