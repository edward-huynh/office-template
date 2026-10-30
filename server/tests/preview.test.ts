import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createPreviewGenerator,
  PlaceholderPreviewGenerator,
} from '../src/infra/preview/preview-generator.js';
import { createLogger } from '../src/shared/utils/logger.js';
import { CATALOG_DIR } from './helpers.js';

const installed = (name: string) => {
  try {
    execFileSync('which', [name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const hasLibreOffice = (installed('soffice') || installed('libreoffice')) && installed('pdftoppm');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const logger = createLogger('silent', 'test');

describe('PlaceholderPreviewGenerator', () => {
  it('produces a safe SVG even for hostile names', async () => {
    const preview = await new PlaceholderPreviewGenerator().generate({
      file: Buffer.alloc(0),
      type: 'docx',
      name: '"><script>alert(1)</script>',
    });
    const svg = preview.thumbnail.data.toString();
    expect(preview.thumbnail.extension).toBe('svg');
    expect(svg).not.toContain('<script');
    expect(svg).toContain('&#60;script');
  });
});

describe('createPreviewGenerator fallback', () => {
  it('falls back to a placeholder when the binaries do not exist', async () => {
    const generator = await createPreviewGenerator(
      { sofficePath: '/nonexistent/soffice', pdftoppmPath: '/nonexistent/pdftoppm' },
      logger,
    );
    const preview = await generator.generate({ file: Buffer.from('x'), type: 'pptx', name: 'Deck' });
    expect(preview.pages).toHaveLength(1);
    expect(preview.thumbnail.extension).toBe('svg');
  });

  it('falls back to a placeholder when the converter exits with an error', async () => {
    // `false` exists on every Unix and always exits non-zero, standing in for a crashing soffice.
    const generator = await createPreviewGenerator({ sofficePath: '/usr/bin/false', pdftoppmPath: '/usr/bin/false' }, logger);
    const preview = await generator.generate({ file: Buffer.from('x'), type: 'docx', name: 'Broken' });
    expect(preview.thumbnail.extension).toBe('svg');
    expect(preview.pages).toHaveLength(1);
  });
});

// Runs only where LibreOffice and poppler are installed (always in the Docker image).
describe.skipIf(!hasLibreOffice)('LibreOffice previews', () => {
  it('renders every slide of a PPTX as PNG', async () => {
    const generator = await createPreviewGenerator({}, logger);
    const file = await fs.readFile(path.join(CATALOG_DIR, 'pptx/pitch-deck-modern/template.pptx'));
    const preview = await generator.generate({ file, type: 'pptx', name: 'Pitch' });
    expect(preview.pages).toHaveLength(6);
    expect(preview.pages.every((page) => page.extension === 'png' && page.data.subarray(0, 4).equals(PNG_SIGNATURE))).toBe(true);
    expect(preview.thumbnail.data.equals(preview.pages[0]!.data)).toBe(true);
  }, 90_000);

  it('renders a DOCX page as PNG', async () => {
    const generator = await createPreviewGenerator({}, logger);
    const file = await fs.readFile(path.join(CATALOG_DIR, 'docx/project-proposal/template.docx'));
    const preview = await generator.generate({ file, type: 'docx', name: 'Proposal' });
    expect(preview.pages.length).toBeGreaterThanOrEqual(1);
    expect(preview.thumbnail.extension).toBe('png');
  }, 90_000);
});
