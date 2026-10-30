import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_TOKEN, CATALOG_DIR, createTestContext } from './helpers.js';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
let validDocx: Buffer;
beforeAll(async () => {
  ctx = await createTestContext();
  validDocx = await fs.readFile(path.join(CATALOG_DIR, 'docx/business-letter/template.docx'));
});
afterAll(() => ctx.cleanup());

function upload(file: Buffer | string, fields: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const form = new FormData();
  form.set('file', new File([typeof file === 'string' ? file : new Uint8Array(file)], 'upload.docx'));
  form.set('name', fields.name ?? 'Uploaded Template');
  form.set('category', fields.category ?? 'Custom');
  form.set('description', fields.description ?? 'A template added through the admin API');
  if (fields.id) form.set('id', fields.id);
  return ctx.session().json('/api/admin/templates', { method: 'POST', body: form, headers });
}

describe('POST /api/admin/templates', () => {
  it('requires the admin token', async () => {
    expect((await upload(validDocx)).status).toBe(401);
    expect((await upload(validDocx, {}, { 'x-admin-token': 'wrong-token-value' })).status).toBe(401);
  });

  it('adds a template that immediately appears in the catalog and can be used', async () => {
    const created = await upload(validDocx, { name: 'Uploaded Template' }, { 'x-admin-token': ADMIN_TOKEN });
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
    const response = await upload(pptx, { name: 'Disguised Deck' }, { 'x-admin-token': ADMIN_TOKEN });
    expect(response.status).toBe(201);
    expect(response.body.data.type).toBe('pptx');
  });

  it('versions a template only when the file changes', async () => {
    const headers = { 'x-admin-token': ADMIN_TOKEN };
    const first = await upload(validDocx, { id: 'versioned', name: 'Versioned' }, headers);
    expect(first.body.data.version).toBe(1);
    const same = await upload(validDocx, { id: 'versioned', name: 'Versioned' }, headers);
    expect(same.status).toBe(200);
    expect(same.body.data.version).toBe(1);

    const other = await fs.readFile(path.join(CATALOG_DIR, 'docx/invoice-simple/template.docx'));
    const changed = await upload(other, { id: 'versioned', name: 'Versioned' }, headers);
    expect(changed.status).toBe(200);
    expect(changed.body.data.version).toBe(2);
  });

  it('rejects files that are not valid DOCX or PPTX', async () => {
    const headers = { 'x-admin-token': ADMIN_TOKEN };
    expect((await upload('just some text', {}, headers)).status).toBe(415);
    expect((await upload(Buffer.from('PK\x03\x04 not really a zip'), {}, headers)).status).toBe(415);
  });

  it('rejects files larger than the upload limit', async () => {
    const big = Buffer.alloc(1.5 * 1024 * 1024, 1);
    const response = await upload(big, {}, { 'x-admin-token': ADMIN_TOKEN });
    expect(response.status).toBe(413);
    expect(response.body.success).toBe(false);
  });

  it('validates the form fields', async () => {
    const response = await upload(validDocx, { id: 'Not A Slug' }, { 'x-admin-token': ADMIN_TOKEN });
    expect(response.status).toBe(422);
    expect(response.body.errors).toHaveProperty('id');
  });
});
