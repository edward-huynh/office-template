#!/usr/bin/env node
/**
 * Measures the JavaScript and CSS a visitor downloads for each page of a RUNNING build, by reading
 * the script, modulepreload and stylesheet tags of the server-rendered HTML and gzipping each file.
 *
 *   pnpm build && pnpm start        (in one terminal; API server in another)
 *   pnpm analyze [baseUrl]
 *
 * Exits with a non-zero status when a page exceeds its initial JavaScript budget.
 */
import { gzipSync } from 'node:zlib';

const base = (process.argv[2] ?? process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
// The framework baseline (React, router, Start runtime) is about 115 KB gzip. beUI's animation runtime
// (motion, loaded with LazyMotion) adds about 30 KB on content pages and about 55 KB on the gallery,
// which also has the segmented tabs and the input.
const BUDGET_KB = Number(process.env.JS_BUDGET_KB ?? 210);

const pages = [
  { path: '/', budget: BUDGET_KB },
  { path: '/docx', budget: BUDGET_KB },
  { path: '/pptx', budget: BUDGET_KB },
  { path: '/docx/business-letter', budget: BUDGET_KB },
  { path: '/documents', budget: BUDGET_KB },
];

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

async function assetsOf(path) {
  const html = await (await fetch(`${base}${path}`)).text();
  const urls = new Set();
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*>/g)) {
    const tag = match[0];
    const url = /(?:src|href)="([^"]+)"/.exec(tag)?.[1];
    if (!url || !url.startsWith('/')) continue;
    const isScript = tag.startsWith('<script') && /type="module"/.test(tag);
    const isPreload = /rel="modulepreload"/.test(tag);
    const isCss = /rel="stylesheet"/.test(tag);
    if (isScript || isPreload) urls.add(`js:${url}`);
    else if (isCss) urls.add(`css:${url}`);
  }
  return [...urls];
}

let failed = false;
console.log(`Bundle report for ${base} (gzip sizes, JS budget ${BUDGET_KB} KB per page)\n`);
for (const page of pages) {
  const assets = await assetsOf(page.path);
  let js = 0;
  let css = 0;
  for (const asset of assets) {
    const [kind, url] = [asset.slice(0, asset.indexOf(':')), asset.slice(asset.indexOf(':') + 1)];
    const body = Buffer.from(await (await fetch(`${base}${url}`)).arrayBuffer());
    const size = gzipSync(body).length;
    if (kind === 'js') js += size;
    else css += size;
  }
  const over = js > page.budget * 1024;
  if (over) failed = true;
  console.log(
    `${over ? 'OVER ' : 'ok   '} ${page.path.padEnd(26)} JS ${kb(js).padStart(9)}  CSS ${kb(css).padStart(8)}  (${assets.length} files)`,
  );
}
if (failed) {
  console.error('\nAt least one page exceeds its JavaScript budget.');
  process.exit(1);
}
