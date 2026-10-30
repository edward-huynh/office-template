import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPreviewGenerator } from '../src/infra/preview/preview-generator.js';
import { createLogger } from '../src/shared/utils/logger.js';
import { PptxPackage } from '../src/doctypes/pptx/xml.js';
import { readDeck } from '../src/doctypes/pptx/pptx-reader.js';
import { createTestContext, snapshotDir } from './helpers.js';

let ctx: Awaited<ReturnType<typeof createTestContext>>;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.cleanup());

const JSON_HEADERS = { 'content-type': 'application/json' };

async function newDeck(session: ReturnType<typeof ctx.session>, template = 'pitch-deck-modern') {
  const { body } = await session.json(`/api/templates/${template}/use`, { method: 'POST' });
  return body.data.id as string;
}

describe('GET /api/documents/:id/slides', () => {
  it('returns a render-ready model of the deck', async () => {
    const session = ctx.session();
    const id = await newDeck(session);
    const { status, body } = await session.json(`/api/documents/${id}/slides`);
    expect(status).toBe(200);
    const deck = body.data;

    expect(deck.width).toBeCloseTo(960, 0);
    expect(deck.height).toBeCloseTo(540, 0);
    expect(deck.slides).toHaveLength(6);

    const title = deck.slides[0].shapes.find((s: any) => s.kind === 'text' && s.paragraphs[0]?.runs[0]?.text === 'Your Startup Name');
    expect(title).toBeDefined();
    expect(title.paragraphs[0].runs[0]).toMatchObject({ bold: true, size: 38 });
    expect(title.w).toBeGreaterThan(500);

    // Decoration (the accent bar) is a separate, non-editable shape with a fill.
    expect(deck.slides[0].shapes.some((s: any) => s.kind === 'shape' && s.fill === '38BDF8')).toBe(true);
    expect(deck.slides[0].background).toBe('0F172A');

    // Bullets are reported on the paragraph.
    const bullets = deck.slides[1].shapes.find((s: any) => s.paragraphs[0]?.bullet);
    expect(bullets.paragraphs.length).toBe(3);
  });

  it('is rejected for documents without slides', async () => {
    const session = ctx.session();
    const { body } = await session.json('/api/templates/business-letter/use', { method: 'POST' });
    const { status } = await session.json(`/api/documents/${body.data.id}/slides`);
    expect(status).toBe(400);
  });

  it('is scoped to the owning session', async () => {
    const owner = ctx.session();
    const id = await newDeck(owner);
    expect((await ctx.session().json(`/api/documents/${id}/slides`)).status).toBe(404);
  });
});

describe('PUT /api/documents/:id/slides', () => {
  it('rewrites the text of the listed shapes only and keeps the file a valid PPTX', async () => {
    const templateRoot = path.join(ctx.root, 'templates');
    const before = await snapshotDir(templateRoot);

    const session = ctx.session();
    const id = await newDeck(session);
    const { body } = await session.json(`/api/documents/${id}/slides`);
    const slide = body.data.slides[0];
    const title = slide.shapes.find((s: any) => s.paragraphs[0]?.runs[0]?.text === 'Your Startup Name');
    const subtitle = slide.shapes.find((s: any) => s.paragraphs[0]?.runs[0]?.text.startsWith('One sentence'));

    const response = await session.json(`/api/documents/${id}/slides`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        slides: [
          {
            index: 0,
            shapes: [
              {
                id: title.id,
                paragraphs: [{ align: 'ctr', runs: [{ text: 'Acme <Corp> & Sons', bold: true, size: 40, color: 'FF0000' }] }],
              },
            ],
          },
        ],
      }),
    });
    expect(response.status).toBe(200);

    const reread = (await session.json(`/api/documents/${id}/slides`)).body.data;
    const newTitle = reread.slides[0].shapes.find((s: any) => s.id === title.id);
    expect(newTitle.paragraphs[0]).toMatchObject({ align: 'ctr', runs: [{ text: 'Acme <Corp> & Sons', bold: true, size: 40, color: 'FF0000' }] });
    // The subtitle, which was not part of the edit, is unchanged.
    const sameSubtitle = reread.slides[0].shapes.find((s: any) => s.id === subtitle.id);
    expect(sameSubtitle.paragraphs).toEqual(subtitle.paragraphs);
    expect(reread.slides).toHaveLength(6);

    // The saved file still opens as a PPTX with all of its parts.
    const download = await session.request(`/api/documents/${id}/download`);
    const zip = await JSZip.loadAsync(Buffer.from(await download.arrayBuffer()));
    expect(zip.file('ppt/presentation.xml')).not.toBeNull();
    expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain('Acme &lt;Corp&gt; &amp; Sons');

    // And the template is untouched.
    expect(await snapshotDir(templateRoot)).toEqual(before);
  });

  it('turns newlines into line breaks and adds paragraphs', async () => {
    const session = ctx.session();
    const id = await newDeck(session);
    const deck = (await session.json(`/api/documents/${id}/slides`)).body.data;
    const list = deck.slides[1].shapes.find((s: any) => s.paragraphs[0]?.bullet);

    await session.json(`/api/documents/${id}/slides`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        slides: [
          {
            index: 1,
            shapes: [
              {
                id: list.id,
                paragraphs: [
                  { bullet: true, runs: [{ text: 'First\nsecond line' }] },
                  { bullet: false, runs: [{ text: 'Plain paragraph' }] },
                  { bullet: true, runs: [] },
                ],
              },
            ],
          },
        ],
      }),
    });
    const edited = (await session.json(`/api/documents/${id}/slides`)).body.data.slides[1].shapes.find((s: any) => s.id === list.id);
    expect(edited.paragraphs).toHaveLength(3);
    expect(edited.paragraphs[0].runs.map((r: any) => r.text)).toEqual(['First', '\n', 'second line']);
    expect(edited.paragraphs[0].bullet).toBe(true);
    expect(edited.paragraphs[1].bullet).toBe(false);
  });

  it('strips characters that are illegal in XML', async () => {
    const session = ctx.session();
    const id = await newDeck(session);
    const deck = (await session.json(`/api/documents/${id}/slides`)).body.data;
    const shape = deck.slides[0].shapes.find((s: any) => s.kind === 'text');
    const response = await session.json(`/api/documents/${id}/slides`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ slides: [{ index: 0, shapes: [{ id: shape.id, paragraphs: [{ runs: [{ text: 'ok\u0000\u0008text' }] }] }] }] }),
    });
    expect(response.status).toBe(200);
    const reread = (await session.json(`/api/documents/${id}/slides`)).body.data.slides[0].shapes.find((s: any) => s.id === shape.id);
    expect(reread.paragraphs[0].runs[0].text).toBe('oktext');
  });

  it('rejects unknown slides and shapes', async () => {
    const session = ctx.session();
    const id = await newDeck(session);
    const put = (slides: unknown) =>
      session.json(`/api/documents/${id}/slides`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ slides }) });
    expect((await put([{ index: 99, shapes: [] }])).status).toBe(400);
    expect((await put([{ index: 0, shapes: [{ id: '99999', paragraphs: [] }] }])).status).toBe(400);
    expect((await put([{ index: 0, shapes: [{ id: '2', paragraphs: [{ runs: [{ text: 'x', color: 'not-a-color' }] }] }] }])).status).toBe(422);
  });
});

describe('slide structure', () => {
  it('duplicates a slide after the original and keeps the file valid', async () => {
    const session = ctx.session();
    const id = await newDeck(session);
    const { status, body } = await session.json(`/api/documents/${id}/slides/1/duplicate`, { method: 'POST' });
    expect(status).toBe(200);
    expect(body.data.slides).toHaveLength(7);
    const texts = (i: number) => body.data.slides[i].shapes.flatMap((s: any) => s.paragraphs.flatMap((p: any) => p.runs.map((r: any) => r.text)));
    expect(texts(2)).toEqual(texts(1));
    expect(texts(3)).not.toEqual(texts(2));

    const download = await session.request(`/api/documents/${id}/download`);
    const zip = await JSZip.loadAsync(Buffer.from(await download.arrayBuffer()));
    expect(Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(7);
    expect(await zip.file('[Content_Types].xml')!.async('string')).toContain('/ppt/slides/slide7.xml');
  });

  it('deletes a slide, refuses to delete the last one', async () => {
    const session = ctx.session();
    const id = await newDeck(session, 'lesson-plan');
    const first = await session.json(`/api/documents/${id}/slides/0`, { method: 'DELETE' });
    expect(first.status).toBe(200);
    expect(first.body.data.slides).toHaveLength(4);

    for (let i = 0; i < 3; i += 1) await session.json(`/api/documents/${id}/slides/0`, { method: 'DELETE' });
    const last = await session.json(`/api/documents/${id}/slides/0`, { method: 'DELETE' });
    expect(last.status).toBe(400);
    expect((await session.json(`/api/documents/${id}/slides`)).body.data.slides).toHaveLength(1);

    const bad = await session.json(`/api/documents/${id}/slides/9/duplicate`, { method: 'POST' });
    expect(bad.status).toBe(400);
  });
});

// A strict external check: an edited, duplicated and shortened deck must still open in a real Office engine.
const hasLibreOffice = (() => {
  try {
    for (const name of ['soffice', 'pdftoppm']) execFileSync('which', [name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasLibreOffice)('LibreOffice opens edited decks', () => {
  it('renders every slide of a deck after edit + duplicate + delete', async () => {
    const session = ctx.session();
    const id = await newDeck(session);
    const deck = (await session.json(`/api/documents/${id}/slides`)).body.data;
    const shape = deck.slides[0].shapes.find((s: any) => s.kind === 'text');
    await session.json(`/api/documents/${id}/slides`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ slides: [{ index: 0, shapes: [{ id: shape.id, paragraphs: [{ bullet: true, runs: [{ text: 'Edited', bold: true, color: '00AA00' }] }] }] }] }),
    });
    await session.json(`/api/documents/${id}/slides/2/duplicate`, { method: 'POST' });
    await session.json(`/api/documents/${id}/slides/5`, { method: 'DELETE' });

    const file = Buffer.from(await (await session.request(`/api/documents/${id}/download`)).arrayBuffer());
    const generator = await createPreviewGenerator({}, createLogger('silent', 'test'));
    const preview = await generator.generate({ file, type: 'pptx', name: 'Edited' });
    expect(preview.thumbnail.extension).toBe('png'); // a placeholder would mean LibreOffice rejected the file
    expect(preview.pages).toHaveLength(6); // 6 slides + 1 duplicate - 1 deleted
  }, 120_000);
});

describe('reader on every sample deck', () => {
  it.each(['pitch-deck-modern', 'quarterly-business-review', 'lesson-plan', 'product-launch'])('%s', async (slug) => {
    const file = await fs.readFile(path.join(ctx.root, `templates/pptx/${slug}/template.pptx`));
    const deck = await readDeck(await PptxPackage.open(file));
    expect(deck.slides.length).toBeGreaterThanOrEqual(5);
    for (const slide of deck.slides) {
      expect(slide.shapes.length).toBeGreaterThan(0);
      for (const shape of slide.shapes) {
        expect(shape.w).toBeGreaterThan(0);
        expect(shape.h).toBeGreaterThan(0);
      }
      expect(slide.shapes.some((s) => s.kind === 'text')).toBe(true);
    }
  });
});

describe('blank starters', () => {
  it('are hidden from the gallery listing but usable by id', async () => {
    const session = ctx.session();
    const list = await session.json('/api/templates?pageSize=50');
    const ids = list.body.data.items.map((t: any) => t.id);
    expect(ids).not.toContain('blank-document');
    expect(ids).not.toContain('blank-presentation');
    expect(list.body.data.categories).not.toContain('Blank');
    expect((await session.json('/api/templates?q=blank')).body.data.total).toBe(0);

    const doc = await session.json('/api/templates/blank-document');
    expect(doc.status).toBe(200);
    expect(doc.body.data).toMatchObject({ id: 'blank-document', type: 'docx', category: 'Blank' });
  });

  it('a blank document opens empty and saves what is typed', async () => {
    const session = ctx.session();
    const { body } = await session.json('/api/templates/blank-document/use', { method: 'POST' });
    const id = body.data.id as string;

    const content = (await session.json(`/api/documents/${id}/content`)).body.data;
    expect(content.html.replace(/<[^>]*>/g, '').trim()).toBe('');

    await session.json(`/api/documents/${id}/content`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ html: '<h1>Fresh start</h1><p>Written from a blank page.</p>', title: 'My blank doc' }),
    });
    const file = Buffer.from(await (await session.request(`/api/documents/${id}/download`)).arrayBuffer());
    const xml = await (await JSZip.loadAsync(file)).file('word/document.xml')!.async('string');
    expect(xml).toContain('Written from a blank page.');
    expect((await session.json(`/api/documents/${id}`)).body.data.title).toBe('My blank doc');
  });

  it('a blank presentation has editable title and content boxes; typed text takes their formatting', async () => {
    const session = ctx.session();
    const { body } = await session.json('/api/templates/blank-presentation/use', { method: 'POST' });
    const id = body.data.id as string;

    const deck = (await session.json(`/api/documents/${id}/slides`)).body.data;
    expect(deck.slides).toHaveLength(1);
    const boxes = deck.slides[0].shapes.filter((s: any) => s.kind === 'text');
    expect(boxes.map((s: any) => s.name)).toEqual(['Title', 'Content']);
    expect(boxes[0].defaultSize).toBe(36);
    expect(boxes[1].paragraphs[0].bullet).toBe(true);

    // Typed text arrives without formatting; the saved run picks up the box's size.
    await session.json(`/api/documents/${id}/slides`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        slides: [{ index: 0, shapes: [
          { id: boxes[0].id, paragraphs: [{ runs: [{ text: 'My first slide' }] }] },
          { id: boxes[1].id, paragraphs: [{ bullet: true, runs: [{ text: 'Point one' }] }, { bullet: true, runs: [{ text: 'Point two' }] }] },
        ] }],
      }),
    });
    const reread = (await session.json(`/api/documents/${id}/slides`)).body.data.slides[0].shapes;
    expect(reread.find((s: any) => s.name === 'Title').paragraphs[0].runs[0]).toMatchObject({ text: 'My first slide', size: 36 });
    expect(reread.find((s: any) => s.name === 'Content').paragraphs.map((p: any) => p.runs[0].text)).toEqual(['Point one', 'Point two']);

    // It can be built up into a deck like any other.
    const dup = await session.json(`/api/documents/${id}/slides/0/duplicate`, { method: 'POST' });
    expect(dup.body.data.slides).toHaveLength(2);
  });
});
