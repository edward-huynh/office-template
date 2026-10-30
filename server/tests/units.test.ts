import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { slugify } from '../src/modules/admin/admin.routes.js';
import { detectDocType, getHandler } from '../src/doctypes/registry.js';
import { createDb } from '../src/infra/db/client.js';
import { LocalFileStore } from '../src/infra/storage/file-store.js';
import { seedCatalog } from '../src/modules/templates/seed-catalog.js';
import { TemplateImporter } from '../src/modules/templates/template-importer.js';
import { TemplatesRepository } from '../src/modules/templates/templates.repository.js';
import { loadCatalog } from '../src/modules/templates/manifest-loader.js';
import { parseEnv } from '../src/shared/configs/env.js';
import { ApiError } from '../src/shared/errors/api-error.js';
import { sanitizeEditorHtml } from '../src/shared/utils/sanitize-html.js';
import { CATALOG_DIR } from './helpers.js';

describe('LocalFileStore path safety', () => {
  const store = new LocalFileStore('/tmp/store-root');
  it.each(['../secret', 'a/../../secret', '/etc/passwd', '', 'ok\0.txt', '.'])('rejects key %j', (key) => {
    expect(() => store.resolve(key)).toThrow(ApiError);
  });
  it('accepts nested keys inside the root', () => {
    expect(store.resolve('docx/a/template.docx')).toBe('/tmp/store-root/docx/a/template.docx');
  });
  it('read-only views expose no write methods', () => {
    const view = store.asReadOnly() as unknown as Record<string, unknown>;
    expect(view.write).toBeUndefined();
    expect(view.remove).toBeUndefined();
  });
});

describe('DocType handlers', () => {
  it('reject buffers that are not Open XML packages', async () => {
    for (const type of ['docx', 'pptx'] as const) {
      await expect(getHandler(type).validate(Buffer.from('hello'))).rejects.toMatchObject({ statusCode: 415 });
    }
  });
  it('detect the real type of the sample templates', async () => {
    const docx = await fs.readFile(path.join(CATALOG_DIR, 'docx/business-letter/template.docx'));
    const pptx = await fs.readFile(path.join(CATALOG_DIR, 'pptx/lesson-plan/template.pptx'));
    expect(await detectDocType(docx)).toBe('docx');
    expect(await detectDocType(pptx)).toBe('pptx');
  });
});

describe('sanitizeEditorHtml', () => {
  it('keeps formatting tags and drops dangerous markup', () => {
    const out = sanitizeEditorHtml('<h2>T</h2><p><strong>b</strong> <em>i</em> <u>u</u></p><script>x()</script><a href="javascript:x()">l</a>');
    expect(out).toContain('<h2>T</h2>');
    expect(out).toContain('<strong>b</strong>');
    expect(out).not.toMatch(/script|javascript:/);
  });
});

describe('slugify', () => {
  it('normalizes names to URL-safe slugs', () => {
    expect(slugify('Hợp đồng  Mẫu #1')).toBe('hop-dong-mau-1');
    expect(slugify('  --Hello World--  ')).toBe('hello-world');
  });
});

describe('parseEnv', () => {
  it('applies defaults', () => {
    expect(parseEnv({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).PORT).toBe(3001);
  });
  it('fails fast on invalid values', () => {
    expect(() => parseEnv({ PORT: 'abc' } as NodeJS.ProcessEnv)).toThrow(/Invalid environment configuration/);
  });
  it('requires ADMIN_TOKEN in production', () => {
    expect(() => parseEnv({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/ADMIN_TOKEN/);
  });
});

describe('manifest loader', () => {
  it('loads the shipped catalog', async () => {
    const entries = await loadCatalog(CATALOG_DIR);
    expect(entries.filter((e) => e.manifest.type === 'docx').length).toBeGreaterThanOrEqual(5);
    expect(entries.filter((e) => e.manifest.type === 'pptx').length).toBeGreaterThanOrEqual(3);
  });

  it('rejects a manifest whose id does not match its folder', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'catalog-'));
    await fs.mkdir(path.join(dir, 'docx/real-name'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'docx/real-name/manifest.json'),
      JSON.stringify({
        id: 'other-name',
        type: 'docx',
        name: 'x',
        category: 'x',
        description: 'x',
        file: 'a.docx',
        thumbnail: 't.png',
        previews: ['p.png'],
      }),
    );
    await expect(loadCatalog(dir)).rejects.toThrow(/must match its folder/);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('rejects an invalid manifest', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'catalog-'));
    await fs.mkdir(path.join(dir, 'pptx/bad'), { recursive: true });
    await fs.writeFile(path.join(dir, 'pptx/bad/manifest.json'), JSON.stringify({ id: 'bad' }));
    await expect(loadCatalog(dir)).rejects.toThrow(/Invalid manifest/);
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe('seedCatalog (automatic import on start)', () => {
  it('imports an empty database, then reports everything as already imported', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seed-'));
    const db = createDb(':memory:');
    const importer = new TemplateImporter(new TemplatesRepository(db), new LocalFileStore(path.join(root, 'templates')));

    const first = await seedCatalog(importer, CATALOG_DIR);
    expect(first.total).toBeGreaterThanOrEqual(12);
    expect(first).toMatchObject({ created: first.total, updated: 0, unchanged: 0, failed: [] });

    const second = await seedCatalog(importer, CATALOG_DIR);
    expect(second).toMatchObject({ created: 0, updated: 0, unchanged: first.total, failed: [] });
    db.$client.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('imports only what is missing (a database seeded before new templates existed)', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'seed-'));
    const catalog = await fs.mkdtemp(path.join(os.tmpdir(), 'catalog-copy-'));
    await fs.cp(CATALOG_DIR, catalog, { recursive: true });
    await fs.rm(path.join(catalog, 'docx/blank-document'), { recursive: true });

    const db = createDb(':memory:');
    const repository = new TemplatesRepository(db);
    const importer = new TemplateImporter(repository, new LocalFileStore(path.join(root, 'templates')));
    const before = await seedCatalog(importer, catalog);
    expect(repository.findById('blank-document')).toBeUndefined();

    const after = await seedCatalog(importer, CATALOG_DIR);
    expect(after).toMatchObject({ created: 1, updated: 0, unchanged: before.total });
    expect(repository.findById('blank-document')).toBeDefined();
    db.$client.close();
    await Promise.all([root, catalog].map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it('a missing catalog folder is not an error', async () => {
    const importer = new TemplateImporter(new TemplatesRepository(createDb(':memory:')), new LocalFileStore(os.tmpdir()));
    expect(await seedCatalog(importer, path.join(os.tmpdir(), 'does-not-exist-catalog'))).toMatchObject({ total: 0, failed: [] });
  });
});
