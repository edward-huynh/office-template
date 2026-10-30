/**
 * Regenerates the sample catalog under server/templates/ (template files, preview images and
 * manifests) from scripts/templates/specs.ts. Run with `pnpm generate:templates`, then `pnpm seed`.
 *
 * Generated files are committed so reviewers need no extra tooling to run the project.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { TemplateManifest } from '../src/contracts/index.js';
import { SERVER_ROOT } from '../src/shared/configs/env.js';
import { renderDocx } from './templates/render-docx.js';
import { renderPptx } from './templates/render-pptx.js';
import { docxPagesSvg, slideSvg, svgToPng } from './templates/render-svg.js';
import { blankDocxSpec, blankPptxSpec, docxSpecs, pptxSpecs } from './templates/specs.js';

const CATALOG = path.join(SERVER_ROOT, 'templates');

async function writeTemplate(
  type: 'docx' | 'pptx',
  meta: { id: string; name: string; category: string; description: string; hidden?: boolean },
  file: Buffer,
  svgPages: string[],
  pageWidth: number,
) {
  const dir = path.join(CATALOG, type, meta.id);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(path.join(dir, 'pages'), { recursive: true });

  await fs.writeFile(path.join(dir, `template.${type}`), file);
  await fs.writeFile(path.join(dir, 'thumbnail.png'), svgToPng(svgPages[0]!, 480));
  const previews: string[] = [];
  for (const [index, svg] of svgPages.entries()) {
    const name = `pages/${index + 1}.png`;
    await fs.writeFile(path.join(dir, name), svgToPng(svg, pageWidth));
    previews.push(name);
  }

  const manifest: TemplateManifest = {
    id: meta.id,
    type,
    name: meta.name,
    category: meta.category,
    description: meta.description,
    ...(meta.hidden ? { hidden: true } : {}),
    file: `template.${type}`,
    thumbnail: 'thumbnail.png',
    previews,
  };
  await fs.writeFile(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`  ${type}/${meta.id}  (${previews.length} preview image${previews.length === 1 ? '' : 's'})`);
}

console.log('Generating DOCX templates');
for (const spec of [...docxSpecs, blankDocxSpec]) {
  await writeTemplate('docx', spec, await renderDocx(spec), docxPagesSvg(spec), 720);
}

console.log('Generating PPTX templates');
for (const spec of [...pptxSpecs, blankPptxSpec]) {
  await writeTemplate('pptx', spec, await renderPptx(spec), spec.slides.map((slide) => slideSvg(spec, slide)), 960);
}

console.log(`Done. Catalog written to ${path.relative(process.cwd(), CATALOG) || CATALOG}`);
