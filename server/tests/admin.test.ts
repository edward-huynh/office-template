import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATALOG_DIR, createTestContext } from './helpers.js';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
let validDocx: Buffer;
beforeAll(async () => {
  ctx = await createTestContext();
  validDocx = await fs.readFile(path.join(CATALOG_DIR, 'docx/business-letter/template.docx'));
});
afterAll(() => ctx.cleanup());

function upload(file: Buffer | string, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.set('file', new File([typeof file === 'string' ? file : new Uint8Array(file)], 'upload.docx'));
  form.set('name', fields.name ?? 'Uploaded Template');
  form.set('category', fields.category ?? 'Custom');
  form.set('description', fields.description ?? 'A template added through the admin API');
  if (fields.id) form.set('id', fields.id);
  if (fields.type) form.set('type', fields.type);
  return ctx.session().json('/api/admin/templates', { method: 'POST', body: form });
}

describe('POST /api/admin/templates', () => {
  it('accepts a matching type and rejects a type that disagrees with the file', async () => {
    expect((await upload(validDocx, { name: 'Typed Doc', type: 'docx' })).status).toBe(201);
    const wrong = await upload(validDocx, { name: 'Wrong Type', type: 'pptx' });
    expect(wrong.status).toBe(415);
    expect(wrong.body.message).toMatch(/DOCX file, but the selected type is PPTX/);
    expect((await upload(validDocx, { name: 'Bad Type', type: 'xlsx' })).status).toBe(422);
  });

  it('adds a template that immediately appears in the catalog and can be used', async () => {
    const created = await upload(validDocx, { name: 'Uploaded Template' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ id: 'uploaded-template', type: 'docx', version: 1 });

    const session = ctx.session();
    const list = await session.json('/api/templates?q=uploaded');
    expect(list.body.data.items.map((t: any) => t.id)).toContain('uploaded-template');

    const thumbnail = await session.request('/api/templates/uploaded-template/thumbnail');
    expect(thumbnail.status).toBe(200);
    expect(thumbnail.headers.get('content-type')).toBe('image/svg+xml');
    await thumbnail.arrayBuffer();

    const used = await session.json('/api/templates/uploaded-template/use', { method: 'POST' });
    expect(used.status).toBe(201);
  });

  it('detects the type from the file contents, not the file name', async () => {
    const pptx = await fs.readFile(path.join(CATALOG_DIR, 'pptx/lesson-plan/template.pptx'));
    const response = await upload(pptx, { name: 'Disguised Deck' });
    expect(response.status).toBe(201);
    expect(response.body.data.type).toBe('pptx');
  });

  it('versions a template only when the file changes', async () => {
    const first = await upload(validDocx, { id: 'versioned', name: 'Versioned' });
    expect(first.body.data.version).toBe(1);
    const same = await upload(validDocx, { id: 'versioned', name: 'Versioned' });
    expect(same.status).toBe(200);
    expect(same.body.data.version).toBe(1);

    const other = await fs.readFile(path.join(CATALOG_DIR, 'docx/invoice-simple/template.docx'));
    const changed = await upload(other, { id: 'versioned', name: 'Versioned' });
    expect(changed.status).toBe(200);
    expect(changed.body.data.version).toBe(2);
  });

  it('rejects files that are not valid DOCX or PPTX', async () => {
    expect((await upload('just some text')).status).toBe(415);
    expect((await upload(Buffer.from('PK\x03\x04 not really a zip'))).status).toBe(415);
  });

  it('rejects files larger than the upload limit', async () => {
    const big = Buffer.alloc(1.5 * 1024 * 1024, 1);
    const response = await upload(big, {});
    expect(response.status).toBe(413);
    expect(response.body.success).toBe(false);
  });

  it('validates the form fields', async () => {
    const response = await upload(validDocx, { id: 'Not A Slug' });
    expect(response.status).toBe(422);
    expect(response.body.errors).toHaveProperty('id');
  });
});
