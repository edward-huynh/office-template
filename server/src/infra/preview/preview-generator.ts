import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { DocType } from '../../contracts/index.js';
import type { Logger } from '../../shared/utils/logger.js';

const run = promisify(execFile);

export interface PreviewImage {
  data: Buffer;
  extension: 'png' | 'svg';
}

export interface GeneratedPreview {
  thumbnail: PreviewImage;
  pages: PreviewImage[];
}

export interface PreviewInput {
  file: Buffer;
  type: DocType;
  name: string;
}

export interface PreviewGenerator {
  generate(input: PreviewInput): Promise<GeneratedPreview>;
}

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (char) => `&#${char.charCodeAt(0)};`);

/** Neutral SVG used when LibreOffice is unavailable. Contains no user-controlled markup. */
export class PlaceholderPreviewGenerator implements PreviewGenerator {
  async generate({ type, name }: PreviewInput): Promise<GeneratedPreview> {
    const wide = type === 'pptx';
    const width = wide ? 640 : 480;
    const height = wide ? 360 : 640;
    const label = escapeXml(name.length > 36 ? `${name.slice(0, 33)}...` : name);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="#f1f5f9"/>
<rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="12" fill="#ffffff" stroke="#cbd5e1"/>
<text x="50%" y="46%" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="700" fill="#0f172a">${label}</text>
<text x="50%" y="56%" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#64748b">${type.toUpperCase()} template</text>
<text x="50%" y="64%" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#94a3b8">Preview not available</text>
</svg>`;
    const image: PreviewImage = { data: Buffer.from(svg), extension: 'svg' };
    return { thumbnail: image, pages: [image] };
  }
}

async function findBinary(candidates: string[], explicit?: string): Promise<string | undefined> {
  const names = explicit ? [explicit] : candidates;
  const dirs = (process.env.PATH ?? '').split(path.delimiter);
  for (const name of names) {
    const options = path.isAbsolute(name) ? [name] : dirs.map((dir) => path.join(dir, name));
    for (const option of options) {
      try {
        await fs.access(option, fs.constants.X_OK);
        return option;
      } catch {
        /* try next */
      }
    }
  }
  return undefined;
}

const MAX_PREVIEW_PAGES = 20;
const CONVERT_TIMEOUT_MS = 90_000;

/** Renders an Office file to PNG pages with LibreOffice (to PDF) and pdftoppm. */
export class LibreOfficePreviewGenerator implements PreviewGenerator {
  constructor(
    private readonly soffice: string,
    private readonly pdftoppm: string,
  ) {}

  async generate({ file, type }: PreviewInput): Promise<GeneratedPreview> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'preview-'));
    try {
      const source = path.join(dir, `source.${type}`);
      await fs.writeFile(source, file);
      await run(
        this.soffice,
        [
          `-env:UserInstallation=file://${path.join(dir, 'profile')}`,
          '--headless',
          '--convert-to',
          'pdf',
          '--outdir',
          dir,
          source,
        ],
        { timeout: CONVERT_TIMEOUT_MS },
      );
      await run(
        this.pdftoppm,
        ['-png', '-r', '60', '-l', String(MAX_PREVIEW_PAGES), path.join(dir, 'source.pdf'), path.join(dir, 'page')],
        { timeout: CONVERT_TIMEOUT_MS },
      );
      const names = (await fs.readdir(dir)).filter((n) => /^page-\d+\.png$/.test(n)).sort();
      if (names.length === 0) throw new Error('No pages were rendered');
      const pages: PreviewImage[] = [];
      for (const name of names) {
        pages.push({ data: await fs.readFile(path.join(dir, name)), extension: 'png' });
      }
      return { thumbnail: pages[0]!, pages };
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
}

/** Tries LibreOffice when installed; otherwise (or on failure) falls back to the placeholder. */
class FallbackPreviewGenerator implements PreviewGenerator {
  private readonly placeholder = new PlaceholderPreviewGenerator();
  constructor(
    private readonly primary: PreviewGenerator | undefined,
    private readonly logger: Logger,
  ) {}

  async generate(input: PreviewInput): Promise<GeneratedPreview> {
    if (this.primary) {
      try {
        return await this.primary.generate(input);
      } catch (error) {
        this.logger.warn({ err: error }, 'LibreOffice preview failed, using placeholder');
      }
    }
    return this.placeholder.generate(input);
  }
}

export async function createPreviewGenerator(
  options: { sofficePath?: string; pdftoppmPath?: string },
  logger: Logger,
): Promise<PreviewGenerator> {
  const soffice = await findBinary(['soffice', 'libreoffice'], options.sofficePath);
  const pdftoppm = await findBinary(['pdftoppm'], options.pdftoppmPath);
  if (soffice && pdftoppm) {
    logger.info('LibreOffice detected: previews for uploaded templates will be rendered');
    return new FallbackPreviewGenerator(new LibreOfficePreviewGenerator(soffice, pdftoppm), logger);
  }
  logger.warn('LibreOffice or pdftoppm not found: uploaded templates will get placeholder previews');
  return new FallbackPreviewGenerator(undefined, logger);
}
