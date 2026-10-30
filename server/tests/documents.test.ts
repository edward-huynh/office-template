import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, sha256, snapshotDir } from './helpers.js';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.cleanup());

const useTemplate = (session: ReturnType<typeof ctx.session>, id: string) =>
  session.json(`/api/templates/${id}/use`, { method: 'POST' });

describe('copy-on-use', () => {
  it('creates an independent document and leaves every template file untouched', async () => {
    const templateRoot = path.join(ctx.root, 'templates');
    const before = await snapshotDir(templateRoot);

    const session = ctx.session();
    const created = await useTemplate(session, 'meeting-minutes');
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    // Edit the copy.
    const edit = await session.json(`/api/documents/${id}/content`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ html: '<h1>Edited</h1><p>Changed content</p>', title: 'My notes' }),
    });
    expect(edit.status).toBe(200);
    expect(edit.body.data.title).toBe('My notes');

    expect(await snapshotDir(templateRoot)).toEqual(before);

    // The copy is a different file from the template.
    const doc = await ctx.documentStore.read(`${id}.docx`);
    const original = await ctx.templateStore.read('docx/meeting-minutes/template.docx');
    expect(sha256(doc)).not.toBe(sha256(original));
  });

  it('gives each use its own document', async () => {
    const session = ctx.session();
    const a = await useTemplate(session, 'business-letter');
    const b = await useTemplate(session, 'business-letter');
    expect(a.body.data.id).not.toBe(b.body.data.id);

    const list = await session.json('/api/documents');
    expect(list.body.data.items.length).toBe(2);
  });

  it('records which template version the copy came from', async () => {
    const session = ctx.session();
    const { body } = await useTemplate(session, 'invoice-simple');
    const doc = await session.json(`/api/documents/${body.data.id}`);
    expect(doc.body.data).toMatchObject({ templateId: 'invoice-simple', templateVersion: 1, type: 'docx' });
  });

  it('returns 404 when the template does not exist', async () => {
    const { status } = await useTemplate(ctx.session(), 'ghost-template');
    expect(status).toBe(404);
  });
});

describe('session ownership', () => {
  it("hides one session's documents from another", async () => {
    const owner = ctx.session();
    const stranger = ctx.session();
    const { body } = await useTemplate(owner, 'resume-modern');
    const id = body.data.id as string;

    for (const suffix of ['', '/content', '/download']) {
      const response = await stranger.request(`/api/documents/${id}${suffix}`);
      expect(response.status).toBe(404);
      await response.arrayBuffer();
    }
    expect((await stranger.json('/api/documents')).body.data.items).toEqual([]);
    expect((await owner.json(`/api/documents/${id}`)).status).toBe(200);
  });

  it('sets an httpOnly session cookie', async () => {
    const response = await ctx.app.request('/api/documents');
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toMatch(/ot_sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });
});

describe('DOCX editing', () => {
  it('round-trips edited content into a valid DOCX that keeps basic formatting', async () => {
    const session = ctx.session();
    const { body } = await useTemplate(session, 'project-proposal');
    const id = body.data.id as string;

    const content = await session.json(`/api/documents/${id}/content`);
    expect(content.status).toBe(200);
    const html = content.body.data.html as string;
    // Template look is carried into the editor as inline styles (heading colour and size).
    expect(html).toMatch(/<h1><span style="[^"]*color:#6A1B9A[^"]*">Project Proposal<\/span><\/h1>/);
    expect(content.body.data.defaults).toMatchObject({ fontFamily: 'Calibri', fontSize: 11 });
    expect(html).toContain('<table>');
    expect(html).toContain('<li>');

    const edited = html.replace('Project Proposal', 'Apollo Proposal <strong>Final</strong>');
    const saved = await session.json(`/api/documents/${id}/content`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ html: edited }),
    });
    expect(saved.status).toBe(200);

    const download = await session.request(`/api/documents/${id}/download`);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toContain('wordprocessingml.document');
    expect(download.headers.get('content-disposition')).toContain('attachment');
    const file = Buffer.from(await download.arrayBuffer());
    expect(file.subarray(0, 2).toString()).toBe('PK');

    const roundTrip = await mammoth.convertToHtml({ buffer: file });
    expect(roundTrip.value).toContain('Apollo Proposal');
    expect(roundTrip.value).toContain('<strong>Final</strong>');
    expect(roundTrip.value).toContain('<table>');
    expect(roundTrip.value).toContain('<li>');
  });

  it('keeps fonts, colours and alignment: in the saved DOCX and when the document is reopened', async () => {
    const session = ctx.session();
    const { body } = await useTemplate(session, 'business-letter');
    const id = body.data.id as string;
    const html =
      '<h1><span style="color:#C62828;font-size:30pt">Styled</span></h1>' +
      '<p style="text-align:center"><span style="font-family:Georgia;font-size:14pt;background-color:#FFFF00">Centered georgia</span></p>';
    const saved = await session.json(`/api/documents/${id}/content`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ html }),
    });
    expect(saved.status).toBe(200);

    // Reopening returns the editor's own HTML, so nothing the DOCX writer drops is lost in the editor.
    const reopened = (await session.json(`/api/documents/${id}/content`)).body.data;
    expect(reopened.html).toContain('color:#C62828');
    expect(reopened.html).toContain('text-align:center');
    expect(reopened.html).toContain('font-family:Georgia');
    expect(reopened.defaults).toMatchObject({ fontFamily: 'Calibri' });

    // The downloaded file carries the formatting as real Word properties.
    const file = Buffer.from(await (await session.request(`/api/documents/${id}/download`)).arrayBuffer());
    const xml = await (await JSZip.loadAsync(file)).file('word/document.xml')!.async('string');
    expect(xml).toMatch(/w:color w:val="C62828"/i);
    expect(xml).toMatch(/w:jc w:val="center"/);
    expect(xml).toMatch(/Georgia/);
  });

  it('drops disallowed CSS but keeps the allowed properties', async () => {
    const session = ctx.session();
    const { body } = await useTemplate(session, 'business-letter');
    const id = body.data.id as string;
    await session.json(`/api/documents/${id}/content`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        html: '<p style="color:#112233;position:fixed;background:url(javascript:alert(1));font-size:expression(alert(1))">x</p>',
      }),
    });
    const reopened = (await session.json(`/api/documents/${id}/content`)).body.data.html as string;
    expect(reopened).toContain('color:#112233');
    expect(reopened).not.toMatch(/position|url\(|expression|javascript/i);
  });

  it('strips scripts and event handlers from submitted HTML', async () => {
    const session = ctx.session();
    const { body } = await useTemplate(session, 'business-letter');
    const id = body.data.id as string;
    const malicious = '<p onclick="alert(1)">Hello</p><script>alert(2)</script><img src="javascript:alert(3)">';
    const saved = await session.json(`/api/documents/${id}/content`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ html: malicious }),
    });
    expect(saved.status).toBe(200);
    const reread = await session.json(`/api/documents/${id}/content`);
    expect(reread.body.data.html).toContain('Hello');
    expect(reread.body.data.html).not.toMatch(/script|onclick|javascript:/i);
  });

  it('validates the save payload', async () => {
    const session = ctx.session();
    const { body } = await useTemplate(session, 'business-letter');
    const response = await session.json(`/api/documents/${body.data.id}/content`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ html: 42 }),
    });
    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
  });
});

describe('PPTX documents', () => {
  it('can be downloaded as a valid PPTX and are read-only in the editor API', async () => {
    const session = ctx.session();
    const { body } = await useTemplate(session, 'pitch-deck-modern');
    const id = body.data.id as string;

    const doc = await session.json(`/api/documents/${id}`);
    expect(doc.body.data.previewUrls.length).toBe(6);

    const content = await session.json(`/api/documents/${id}/content`);
    expect(content.status).toBe(400);

    const download = await session.request(`/api/documents/${id}/download`);
    expect(download.headers.get('content-type')).toContain('presentationml.presentation');
    expect(download.headers.get('content-disposition')).toContain('.pptx');
    const file = Buffer.from(await download.arrayBuffer());
    const original = await fs.readFile(path.join(ctx.root, 'templates/pptx/pitch-deck-modern/template.pptx'));
    expect(sha256(file)).toBe(sha256(original));
  });
});
