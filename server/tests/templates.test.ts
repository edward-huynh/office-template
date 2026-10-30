import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext } from './helpers.js';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.cleanup());

describe('GET /api/templates', () => {
  it('lists the catalog with at least 6 DOCX and 4 PPTX templates', async () => {
    const docx = await ctx.session().json('/api/templates?type=docx&pageSize=50');
    const pptx = await ctx.session().json('/api/templates?type=pptx&pageSize=50');
    expect(docx.status).toBe(200);
    expect(docx.body.data.items.length).toBeGreaterThanOrEqual(5);
    expect(pptx.body.data.items.length).toBeGreaterThanOrEqual(3);
    expect(docx.body.data.items.every((t: any) => t.type === 'docx')).toBe(true);
  });

  it('exposes URLs, never storage paths', async () => {
    const { body } = await ctx.session().json('/api/templates?type=pptx');
    const template = body.data.items[0];
    expect(template.thumbnailUrl).toMatch(/^\/api\/templates\/[a-z0-9-]+\/thumbnail\?v=/);
    expect(template.previewUrls.length).toBeGreaterThan(1);
    expect(JSON.stringify(template)).not.toContain('filePath');
  });

  it('filters by search text and category', async () => {
    const search = await ctx.session().json('/api/templates?q=invoice');
    expect(search.body.data.items.map((t: any) => t.id)).toEqual(['invoice-simple']);

    const category = await ctx.session().json('/api/templates?type=docx&category=Meetings');
    expect(category.body.data.items.map((t: any) => t.id)).toEqual(['meeting-minutes']);
    expect(category.body.data.categories).toContain('Letters');
  });

  it('returns an empty list (not an error) when nothing matches', async () => {
    const { status, body } = await ctx.session().json('/api/templates?q=zzzz-no-match');
    expect(status).toBe(200);
    expect(body.data.items).toEqual([]);
    expect(body.data.total).toBe(0);
  });

  it('treats LIKE wildcards in the query as literal text', async () => {
    const { body } = await ctx.session().json('/api/templates?q=%25');
    expect(body.data.total).toBe(0);
  });

  it('paginates', async () => {
    const first = await ctx.session().json('/api/templates?pageSize=3&page=1');
    const second = await ctx.session().json('/api/templates?pageSize=3&page=2');
    expect(first.body.data.items).toHaveLength(3);
    expect(first.body.data.total).toBeGreaterThanOrEqual(10);
    expect(second.body.data.items[0].id).not.toBe(first.body.data.items[0].id);
  });

  it('rejects invalid query parameters with the error envelope', async () => {
    const { status, body } = await ctx.session().json('/api/templates?type=xlsx&pageSize=500');
    expect(status).toBe(422);
    expect(body).toMatchObject({ success: false, statusCode: 422 });
    expect(Object.keys(body.errors)).toEqual(expect.arrayContaining(['type', 'pageSize']));
  });
});

describe('GET /api/templates/:id', () => {
  it('returns one template', async () => {
    const { status, body } = await ctx.session().json('/api/templates/business-letter');
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ id: 'business-letter', type: 'docx', version: 1 });
  });

  it('returns 404 for an unknown template', async () => {
    const { status, body } = await ctx.session().json('/api/templates/does-not-exist');
    expect(status).toBe(404);
    expect(body).toMatchObject({ success: false, statusCode: 404 });
  });

  it('serves the thumbnail as a cacheable PNG and honours If-None-Match', async () => {
    const session = ctx.session();
    const first = await session.request('/api/templates/business-letter/thumbnail');
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe('image/png');
    expect(first.headers.get('cache-control')).toContain('immutable');
    const etag = first.headers.get('etag')!;
    await first.arrayBuffer();

    const second = await session.request('/api/templates/business-letter/thumbnail', { headers: { 'if-none-match': etag } });
    expect(second.status).toBe(304);
  });

  it('serves each preview page and 404s outside the range', async () => {
    const ok = await ctx.session().request('/api/templates/pitch-deck-modern/pages/5');
    expect(ok.status).toBe(200);
    await ok.arrayBuffer();
    const missing = await ctx.session().json('/api/templates/pitch-deck-modern/pages/40');
    expect(missing.status).toBe(404);
  });
});

describe('unknown routes', () => {
  it('return the error envelope', async () => {
    const { status, body } = await ctx.session().json('/api/nope');
    expect(status).toBe(404);
    expect(body.success).toBe(false);
  });
});

describe('OpenAPI', () => {
  it('documents the main endpoints', async () => {
    const { body } = await ctx.session().json('/api/openapi.json');
    expect(Object.keys(body.paths)).toEqual(
      expect.arrayContaining([
        '/templates',
        '/templates/{id}',
        '/templates/{id}/use',
        '/documents',
        '/documents/{id}/content',
        '/documents/{id}/download',
        '/admin/templates',
      ]),
    );
  });
});
