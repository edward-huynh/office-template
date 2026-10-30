import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { pooledHandlers } from '../src/doctypes/pooled.js';
import { getBaseHandler } from '../src/doctypes/registry.js';
import { DocumentPool } from '../src/infra/workers/document-pool.js';
import { CATALOG_DIR, createTestContext } from './helpers.js';

// The worker entry file is TypeScript, so the test worker is started through tsx.
const pool = new DocumentPool({ threads: 1, execArgv: ['--import', 'tsx'] });
afterAll(() => pool.close());

const lorem = 'Quarterly planning aligns teams around measurable outcomes, shared priorities and a clear owner for every decision. ';
const bigHtml = (paragraphs: number) =>
  Array.from({ length: paragraphs }, (_, i) => `${i % 10 === 0 ? `<h2>Section ${i}</h2>` : ''}<p>${lorem.repeat(3)}</p>`).join('');

describe('document worker pool', () => {
  it('converts documents in a worker thread and hands back real Buffers', async () => {
    const { file, html } = await pool.call<{ file: Buffer; html: string }>('docx', 'fromEditorContent', [{ html: '<h1>Hi</h1><p onclick="x()">There</p>' }]);
    expect(Buffer.isBuffer(file)).toBe(true);
    expect(file.subarray(0, 2).toString()).toBe('PK');
    expect(html).toBe('<h1>Hi</h1><p>There</p>'); // sanitized in the worker too
    await expect(pool.call('docx', 'validate', [file])).resolves.toBeUndefined();

    const back = await pool.call<{ html: string }>('docx', 'toEditorContent', [file]);
    expect(back.html).toMatch(/<h1>.*Hi.*<\/h1>/);
  });

  it('reads and edits PPTX in the worker', async () => {
    const source = await fs.readFile(path.join(CATALOG_DIR, 'pptx/pitch-deck-modern/template.pptx'));
    const deck = await pool.call<{ slides: unknown[] }>('pptx', 'readSlides', [source]);
    expect(deck.slides).toHaveLength(6);
    const bigger = await pool.call<Buffer>('pptx', 'duplicateSlide', [source, 0]);
    expect(Buffer.isBuffer(bigger)).toBe(true);
    expect((await pool.call<{ slides: unknown[] }>('pptx', 'readSlides', [bigger])).slides).toHaveLength(7);
  });

  it('keeps ApiError status codes across the thread boundary', async () => {
    await expect(pool.call('docx', 'validate', [Buffer.from('not a docx')])).rejects.toMatchObject({ statusCode: 415 });
    await expect(pool.call('pptx', 'duplicateSlide', [await fs.readFile(path.join(CATALOG_DIR, 'pptx/lesson-plan/template.pptx')), 99])).rejects.toMatchObject({ statusCode: 400 });
  });

  it('handles several requests at once', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => pool.call<{ html: string }>('docx', 'fromEditorContent', [{ html: `<p>doc ${i}</p>` }])));
    expect(results.map((r) => r.html)).toEqual(Array.from({ length: 6 }, (_, i) => `<p>doc ${i}</p>`));
  });

  it('replaces a worker that dies and fails only its in-flight requests', async () => {
    const own = new DocumentPool({ threads: 1, execArgv: ['--import', 'tsx'] });
    await own.call('docx', 'validate', [(await pool.call<{ file: Buffer }>('docx', 'fromEditorContent', [{ html: '<p>x</p>' }])).file]); // warm up
    const inFlight = own.call('docx', 'fromEditorContent', [{ html: bigHtml(900) }]);
    const caught = inFlight.catch((error) => error);
    await (own as unknown as { slots: Array<{ worker: { terminate(): Promise<number> } }> }).slots[0]!.worker.terminate();
    expect(await caught).toMatchObject({ statusCode: 500 });

    const again = await own.call<{ html: string }>('docx', 'fromEditorContent', [{ html: '<p>after</p>' }]);
    expect(again.html).toBe('<p>after</p>');
    await own.close();
  }, 30_000);

  it('does not block the calling thread while a big document is converted', async () => {
    // Longest gap between 5 ms timer ticks on this thread while a ~900-paragraph save runs.
    const longestGap = async (run: () => Promise<unknown>) => {
      let last = performance.now();
      let worst = 0;
      const timer = setInterval(() => {
        const now = performance.now();
        worst = Math.max(worst, now - last);
        last = now;
      }, 5);
      await run();
      clearInterval(timer);
      return worst;
    };
    const html = bigHtml(900);
    await pool.call('docx', 'fromEditorContent', [{ html: '<p>warm</p>' }]);

    const inline = await longestGap(() => getBaseHandler('docx').fromEditorContent!({ html }));
    const pooled = await longestGap(() => pool.call('docx', 'fromEditorContent', [{ html }]));
    expect(inline).toBeGreaterThan(100); // the work really is heavy on one thread
    expect(pooled).toBeLessThan(inline / 3); // and the worker keeps this thread responsive
  }, 60_000);
});

describe('API with pooled handlers', () => {
  it('edits and downloads a DOCX end to end through the worker', async () => {
    const ctx = await createTestContext({}, pooledHandlers(pool));
    const session = ctx.session();
    const { body } = await session.json('/api/templates/project-proposal/use', { method: 'POST' });
    const id = body.data.id as string;

    const content = (await session.json(`/api/documents/${id}/content`)).body.data;
    expect(content.html).toContain('Project Proposal');
    const saved = await session.json(`/api/documents/${id}/content`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ html: `${content.html}<p style="text-align:center">Added in a worker</p>` }),
    });
    expect(saved.status).toBe(200);
    expect((await session.json(`/api/documents/${id}/content`)).body.data.html).toContain('Added in a worker');

    const slide = (await session.json('/api/templates/lesson-plan/use', { method: 'POST' })).body.data.id as string;
    expect((await session.json(`/api/documents/${slide}/slides/1/duplicate`, { method: 'POST' })).body.data.slides).toHaveLength(6);
    await ctx.cleanup();
  });
});
