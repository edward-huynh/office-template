import type { Deck, SlideEdits } from '../../contracts/index.js';
import { assertOpenXmlPackage } from '../open-xml.js';
import type { DocTypeHandler } from '../types.js';
import { readDeck } from './pptx-reader.js';
import { applyEdits, deleteSlide, duplicateSlide } from './pptx-writer.js';
import { PptxPackage } from './xml.js';

export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** Opens the package, lets `change` modify its XML, and returns the new file bytes. */
async function modify(file: Buffer, change: (pkg: PptxPackage) => Promise<void>): Promise<Buffer> {
  const pkg = await PptxPackage.open(file);
  await change(pkg);
  return pkg.toBuffer();
}

/**
 * PPTX is edited on its slide XML, not rebuilt from another format: text edits touch only the text
 * of the shapes that were changed, so layouts, themes, images and animations survive untouched.
 */
export const pptxHandler: DocTypeHandler = {
  type: 'pptx',
  mimeType: PPTX_MIME,
  extension: 'pptx',
  editor: 'slides',

  async validate(file) {
    await assertOpenXmlPackage(file, ['[Content_Types].xml', 'ppt/presentation.xml'], 'PPTX');
  },

  async readSlides(file): Promise<Deck> {
    return readDeck(await PptxPackage.open(file));
  },
  applySlideEdits: (file: Buffer, edits: SlideEdits) => modify(file, (pkg) => applyEdits(pkg, edits)),
  duplicateSlide: (file: Buffer, index: number) => modify(file, (pkg) => duplicateSlide(pkg, index)),
  deleteSlide: (file: Buffer, index: number) => modify(file, (pkg) => deleteSlide(pkg, index)),
};
