#!/usr/bin/env node
/**
 * Main-thread performance check for the interactions most likely to drop frames, measured in a
 * real Chrome against a RUNNING build:
 *
 *   pnpm start                       (in one terminal)
 *   pnpm --filter @office-template/web perf [baseUrl]
 *
 * For each scenario it records every animation frame (requestAnimationFrame deltas) and every
 * long task (>50 ms, from PerformanceObserver) and prints percentiles. The scenarios use large
 * content on purpose: a ~9,000-word document and a 60-slide deck (--slides=N).
 *
 *   --throttle=4   slow the CPU 4x to emulate a mid-range laptop
 *
 * Numbers from a headless run are only meaningful relative to each other (compare before and
 * after a change on the same machine). Pass --json to print machine-readable output.
 */
import { chromium } from '@playwright/test';

const base = (process.argv.find((a) => a.startsWith('http')) ?? process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const asJson = process.argv.includes('--json');
// --throttle=4 slows the CPU 4x (a mid-range laptop), which exposes main-thread cost a fast machine hides.
const throttle = Number(process.argv.find((a) => a.startsWith('--throttle='))?.split('=')[1] ?? 1);
const SLIDES = Number(process.argv.find((a) => a.startsWith('--slides='))?.split('=')[1] ?? 60);

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1360, height: 860 } });
const page = await context.newPage();
const api = context.request;
if (throttle > 1) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
}

// ------------------------------------------------------------------ measurement

async function startRecording() {
  await page.evaluate(() => {
    const state = { frames: [], long: [], last: performance.now(), raf: 0, observer: null };
    const tick = (t) => {
      state.frames.push(t - state.last);
      state.last = t;
      state.raf = requestAnimationFrame(tick);
    };
    state.raf = requestAnimationFrame(tick);
    try {
      state.observer = new PerformanceObserver((list) => list.getEntries().forEach((e) => state.long.push(e.duration)));
      state.observer.observe({ entryTypes: ['longtask'] });
    } catch {
      /* longtask unsupported */
    }
    window.__perf = state;
  });
}

async function stopRecording() {
  return page.evaluate(() => {
    const s = window.__perf;
    cancelAnimationFrame(s.raf);
    s.observer?.disconnect();
    return { frames: s.frames.slice(2), long: s.long };
  });
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;

function summarize(name, { frames, long }) {
  const sorted = [...frames].sort((a, b) => a - b);
  const over = (ms) => (frames.filter((f) => f > ms).length / Math.max(1, frames.length)) * 100;
  return {
    scenario: name,
    frames: frames.length,
    p50: +pct(sorted, 50).toFixed(1),
    p95: +pct(sorted, 95).toFixed(1),
    max: +(sorted.at(-1) ?? 0).toFixed(1),
    'pct>20ms': +over(20).toFixed(1),
    'pct>50ms': +over(50).toFixed(1),
    longTasks: long.length,
    longTaskMs: Math.round(long.reduce((a, b) => a + b, 0)),
    longestTask: Math.round(Math.max(0, ...long)),
  };
}

const results = [];
async function scenario(name, action) {
  await startRecording();
  await action();
  await page.waitForTimeout(250);
  results.push(summarize(name, await stopRecording()));
}

const settle = async (url) => {
  await page.goto(`${base}${url}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500); // let hydration finish
};

// ------------------------------------------------------------------- test data

const lorem = 'Quarterly planning aligns teams around measurable outcomes, shared priorities and a clear owner for every decision that matters to customers. ';
const bigHtml = Array.from({ length: 150 }, (_, i) => {
  const heading = i % 10 === 0 ? `<h2>Section ${i / 10 + 1}</h2>` : '';
  const table = i % 50 === 25 ? `<table><tbody>${'<tr><td>Item</td><td>Owner</td><td>Due</td><td>Status</td></tr>'.repeat(20)}</tbody></table>` : '';
  return `${heading}<p>${lorem.repeat(3)}</p>${table}`;
}).join('');

async function createWordDoc() {
  const created = await (await api.post(`${base}/api/templates/blank-document/use`)).json();
  const id = created.data.id;
  const saved = await api.put(`${base}/api/documents/${id}/content`, { data: { html: bigHtml } });
  if (!saved.ok()) throw new Error(`could not prepare the document: ${saved.status()}`);
  return id;
}

async function createDeck(slides) {
  const created = await (await api.post(`${base}/api/templates/pitch-deck-modern/use`)).json();
  const id = created.data.id;
  for (let i = 0; i < slides - 6; i += 1) {
    const res = await api.post(`${base}/api/documents/${id}/slides/${i % 5}/duplicate`);
    if (!res.ok()) throw new Error(`could not prepare the deck: ${res.status()}`);
  }
  return id;
}

// ------------------------------------------------------------------- scenarios

await settle('/');
await scenario('gallery: scroll the page', async () => {
  await page.mouse.move(700, 500);
  for (let i = 0; i < 14; i += 1) {
    await page.mouse.wheel(0, 260);
    await page.waitForTimeout(40);
  }
});

await scenario('gallery: open and close quick preview x5', async () => {
  await page.evaluate(() => document.getElementById('main-panel')?.scrollTo(0, 0));
  for (let i = 0; i < 5; i += 1) {
    await page.getByRole('link', { name: 'Preview' }).first().click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
  }
});

await scenario('gallery: switch type tabs x6', async () => {
  const tabs = page.getByRole('tablist', { name: 'Template type' });
  for (const name of ['Presentations', 'Documents', 'All', 'Presentations', 'Documents', 'All']) {
    await tabs.getByRole('tab', { name }).click();
    await page.waitForTimeout(350);
  }
});

const wordId = await createWordDoc();
await settle(`/documents/${wordId}`);
const editor = page.getByRole('textbox', { name: 'Document content' });
await editor.waitFor();
await scenario('word (~9k words): type 300 characters', async () => {
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('Typing speed test. '.repeat(16), { delay: 0 });
});

await scenario('word (~9k words): scroll the page', async () => {
  await page.mouse.move(680, 500);
  for (let i = 0; i < 25; i += 1) {
    await page.mouse.wheel(0, 420);
    await page.waitForTimeout(30);
  }
});

const deckId = await createDeck(SLIDES);
await settle(`/documents/${deckId}`);
await page.getByTestId('slide-canvas').waitFor();
const slideCount = await page.getByRole('navigation', { name: 'Slides' }).getByRole('button').count();
await scenario(`deck (${slideCount} slides): type 100 characters in a text box`, async () => {
  await page.locator('[data-editable]').first().click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('Typing speed test in a big deck. '.repeat(3), { delay: 0 });
});

await scenario(`deck (${slideCount} slides): switch slides x20`, async () => {
  const thumbs = page.getByRole('navigation', { name: 'Slides' }).getByRole('button');
  for (let i = 0; i < 20; i += 1) {
    await thumbs.nth((i * 7) % slideCount).click();
    await page.waitForTimeout(60);
  }
});

await browser.close();

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log(`\nMain-thread performance at ${base}  (CPU throttle ${throttle}x; frame times in ms; lower is better)\n`);
  console.table(results);
  const worst = results.reduce((a, b) => (b.longestTask > a.longestTask ? b : a));
  console.log(`Longest single task: ${worst.longestTask} ms in "${worst.scenario}"`);
}
