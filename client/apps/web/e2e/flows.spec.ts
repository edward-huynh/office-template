import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import JSZip from 'jszip';

const SERVER_TEMPLATES = path.resolve(import.meta.dirname, '../../../../server/templates');

/** beUI controls are not native <select>s: open them and click an option. */
async function pickFont(page: import('@playwright/test').Page, name: string) {
  const box = page.getByRole('combobox', { name: 'Font family' });
  await box.click();
  await box.fill(name);
  await page.getByRole('option', { name, exact: true }).click();
}

async function pickSize(page: import('@playwright/test').Page, size: number) {
  await page.getByRole('button', { name: 'Font size', exact: true }).click();
  await page.getByRole('option', { name: String(size), exact: true }).click();
}

async function readDownload(download: import('@playwright/test').Download) {
  const file = await download.path();
  return fs.readFile(file);
}

test('browse and filter the document library (search links and the Clear filters link)', async ({ page }) => {
  await page.goto('/docx');
  await expect(page.getByRole('heading', { name: 'Document templates' })).toBeVisible();

  await page.goto('/docx?q=minutes');
  await expect(page.getByRole('heading', { name: 'Meeting Minutes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Business Letter' })).toHaveCount(0);

  await page.goto('/docx?q=no-such-template-xyz');
  await expect(page.getByText('No templates match your search')).toBeVisible();
  await page.getByRole('link', { name: 'Clear filters' }).click();
  await expect(page.getByRole('heading', { name: 'Business Letter' })).toBeVisible();
});

test('thumbnails and preview images actually load', async ({ page }) => {
  const loaded = () =>
    page.evaluate(async () => {
      const images = [...document.images];
      await Promise.all(images.map((img) => img.decode().catch(() => undefined)));
      return { total: images.length, broken: images.filter((img) => img.naturalWidth === 0).length };
    });

  await page.goto('/pptx');
  expect(await loaded()).toMatchObject({ broken: 0 });
  await page.goto('/pptx/pitch-deck-modern');
  const preview = await loaded();
  expect(preview.total).toBeGreaterThanOrEqual(6);
  expect(preview.broken).toBe(0);
});

test('quick preview opens in a modal, shows the images, and closes with Escape or the backdrop', async ({ page }) => {
  await page.goto('/pptx');
  await page.getByRole('link', { name: 'Preview' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/pptx$/); // stays in the gallery
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Modern Pitch Deck');

  // Slides: the filmstrip and arrow keys move through them, and every image loads.
  await expect(dialog.getByRole('img', { name: /slide 1 of 6/ })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('img', { name: /slide 2 of 6/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Show slide 5' }).click();
  await expect(dialog.getByRole('img', { name: /slide 5 of 6/ })).toBeVisible();
  const broken = await page.evaluate(async () => {
    const images = [...document.querySelectorAll<HTMLImageElement>('dialog img')];
    await Promise.all(images.map((img) => img.decode().catch(() => undefined)));
    return images.filter((img) => img.naturalWidth === 0).length;
  });
  expect(broken).toBe(0);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await page.getByRole('link', { name: 'Preview' }).first().click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5); // backdrop
  await expect(dialog).toHaveCount(0);
});

test('quick preview of a document lists its pages and links to the full page', async ({ page }) => {
  await page.goto('/docx');
  await page.getByRole('link', { name: 'Preview' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('img', { name: /page 1/ })).toBeVisible();
  await dialog.getByRole('link', { name: 'Open full page' }).click();
  await expect(page).toHaveURL(/\/docx\/[a-z0-9-]+$/);
  const images = page.locator('main ol img');
  await expect(images.first()).toBeVisible();
  const broken = await page.evaluate(async () => {
    const list = [...document.querySelectorAll<HTMLImageElement>('main ol img')];
    await Promise.all(list.map((img) => img.decode().catch(() => undefined)));
    return list.filter((img) => img.naturalWidth === 0).length;
  });
  expect(broken).toBe(0);
});

test('the home gallery mixes both types; tabs and the sidebar navigate', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Start from a template' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Business Letter' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Modern Pitch Deck' })).toBeVisible();
  await expect(page.getByText('10 templates', { exact: false })).toBeVisible();

  await page.getByRole('tablist', { name: 'Template type' }).getByRole('tab', { name: 'Presentations' }).click();
  await expect(page).toHaveURL(/\/pptx$/);
  await expect(page.getByRole('heading', { name: 'Business Letter' })).toHaveCount(0);

  await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Documents' }).click();
  await expect(page).toHaveURL(/\/docx$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Document templates' })).toBeVisible();
});

test('recent files appear on the home page after creating a document', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Continue where you left off')).toHaveCount(0);
  await page.goto('/docx/weekly-status-report');
  await page.getByRole('button', { name: 'Use this template' }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);

  await page.goto('/');
  const recent = page.getByRole('region', { name: 'Continue where you left off' });
  await expect(recent).toBeVisible();
  await expect(recent.getByRole('link', { name: /Weekly Status Report/ })).toBeVisible();
  await recent.getByRole('link', { name: /Weekly Status Report/ }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
});

test('Create blank: the right tiles show on each gallery page, and are not listed as templates', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Blank document/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Blank presentation/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Blank document' })).toHaveCount(0); // not a card

  await page.goto('/docx');
  await expect(page.getByRole('button', { name: /Blank document/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Blank presentation/ })).toHaveCount(0);

  await page.goto('/pptx');
  await expect(page.getByRole('button', { name: /Blank presentation/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Blank document/ })).toHaveCount(0);

  await page.goto('/docx?q=blank');
  await expect(page.getByText('No templates match your search')).toBeVisible();
  await expect(page.getByRole('button', { name: /Blank document/ })).toHaveCount(0); // tiles hide while searching
});

test('Create blank document: empty page, type, save, download', async ({ page }) => {
  await page.goto('/docx');
  await page.getByRole('button', { name: /Blank document/ }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);

  const editor = page.getByRole('textbox', { name: 'Document content' });
  await expect(editor).toBeVisible();
  await expect(page.getByText(/^0 words$/)).toBeVisible();
  await editor.click();
  await page.keyboard.type('Written from a blank page');
  await expect(page.getByText(/^5 words$/)).toBeVisible();
  await page.keyboard.press('ControlOrMeta+S');
  await expect(page.getByRole('status')).toHaveText('Saved');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download DOCX' }).click(),
  ]);
  const xml = await (await JSZip.loadAsync(await readDownload(download))).file('word/document.xml')!.async('string');
  expect(xml).toContain('Written from a blank page');
});

test('Create blank presentation: empty slide with hints, type, save, reload', async ({ page }) => {
  await page.goto('/pptx');
  await page.getByRole('button', { name: /Blank presentation/ }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);

  await expect(page.getByText('Slide 1 of 1')).toBeVisible();
  const title = page.locator('[data-editable][data-hint="Click to add title"]');
  const content = page.locator('[data-editable][data-hint="Click to add text"]');
  await expect(title).toHaveAttribute('data-empty', 'true');
  await expect(content).toHaveAttribute('data-empty', 'true');

  await title.click();
  await page.keyboard.type('Quarterly plan');
  await expect(title).toHaveAttribute('data-empty', 'false');
  await content.click();
  await page.keyboard.type('First point');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second point');

  // New Slide duplicates it, and the deck keeps growing from a blank start.
  await page.getByRole('button', { name: /New slide/ }).click();
  await expect(page.getByText('Slide 2 of 2')).toBeVisible();

  await page.keyboard.press('ControlOrMeta+S');
  await expect(page.getByRole('status')).toHaveText('Saved');
  await page.reload();
  await expect(page.locator('[data-editable]', { hasText: 'Quarterly plan' })).toBeVisible();
  await expect(page.locator('[data-editable]', { hasText: 'Second point' })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download PPTX' }).click(),
  ]);
  const zip = await JSZip.loadAsync(await readDownload(download));
  const slide1 = await zip.file('ppt/slides/slide1.xml')!.async('string');
  expect(slide1).toContain('Quarterly plan');
  expect(slide1).toMatch(/sz="3600"/); // typed text inherits the title box's size
  expect(Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(2);
});

test('Dia-style shell: the page scrolls inside its own panel, the rail stays put', async ({ page }) => {
  await page.goto('/');
  const panel = page.locator('#main-panel');
  await expect(panel).toBeVisible();
  const rail = page.getByRole('navigation', { name: 'Main' }).first();
  const railBefore = await rail.boundingBox();

  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 900);
  await expect.poll(() => panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(300);
  expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0); // the window itself never scrolls
  expect((await rail.boundingBox())?.y).toBe(railBefore?.y); // the rail did not move
  // The panel is a floating rounded card on the tinted backdrop.
  expect(await panel.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).not.toBe('0px');
});

test('command palette finds templates and my files; plus-circles in the sidebar create blank files', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('button', { name: /Search or jump to/ });

  // Template search (the palette loads lazily; the shortcut works before and after that).
  await search.click();
  const field = page.getByPlaceholder('Search templates and your files…');
  await field.fill('pitch');
  await page.getByRole('option', { name: /Modern Pitch Deck/ }).click();
  await expect(page).toHaveURL(/\/pptx\/pitch-deck-modern$/);

  // The plus-circle next to Documents / Presentations in the sidebar creates a blank file.
  await page.goto('/docx');
  await page.getByRole('button', { name: 'New blank document' }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('textbox', { name: 'Document content' })).toBeVisible();

  // Going back: the plus-circle is usable again, not stuck on its spinner.
  await page.goBack();
  await expect(page).toHaveURL(/\/docx$/);
  await expect(page.getByRole('button', { name: 'New blank document' })).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('button', { name: 'New blank document' })).toBeEnabled();

  // A file created earlier is found by name, with the keyboard shortcut.
  await page.goto('/');
  const palette = page.getByPlaceholder('Search templates and your files…');
  // The shortcut is only listened for once the page has hydrated: press it until the palette opens.
  await expect(async () => {
    if (!(await palette.isVisible())) await page.keyboard.press('ControlOrMeta+k');
    await expect(palette).toBeVisible({ timeout: 1000 });
  }).toPass();
  await palette.fill('blank');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.getByRole('option', { name: /Blank/ }).first().click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);

  await page.goto('/');
  await page.getByRole('button', { name: 'New blank presentation' }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);

  await page.goto('/');
  await page.getByRole('button', { name: /Search or jump to/ }).click();
  await page.getByPlaceholder('Search templates and your files…').fill('zzzz-nothing');
  await expect(page.getByText('Nothing matches your search.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0);
});

test('use a DOCX template, edit it, save and download', async ({ page }) => {
  await page.goto('/docx');
  await page.getByRole('link', { name: 'Preview' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Use this template' }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);

  const editor = page.getByRole('textbox', { name: 'Document content' });
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' Edited by Playwright.');
  await expect(page.getByRole('status')).toHaveText('Unsaved changes');

  await page.getByRole('button', { name: 'Bold' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download DOCX' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
  const zip = await JSZip.loadAsync(await readDownload(download));
  const xml = await zip.file('word/document.xml')!.async('string');
  expect(xml).toContain('Edited by Playwright.');

  // The original template is untouched: a second copy starts without the edit.
  await page.goto('/docx');
  await page.getByRole('button', { name: 'Use template' }).first().click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('textbox', { name: 'Document content' })).not.toContainText('Edited by Playwright.');
});

test('Word-style editor: formatting survives saving, reloading and downloading', async ({ page }) => {
  await page.goto('/docx/business-letter');
  await page.getByRole('button', { name: 'Use this template' }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);

  // The page looks like Word: ribbon tabs, ruler, a paper page, and a status bar.
  await expect(page.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('img', { name: 'Ruler' })).toBeVisible();
  await expect(page.getByTestId('page')).toBeVisible();
  await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
  await expect(page.getByText(/\d+ words/)).toBeVisible();

  const editor = page.getByRole('textbox', { name: 'Document content' });
  await editor.getByText('Subject:').click({ clickCount: 3 });
  await pickFont(page, 'Georgia');
  await pickSize(page, 18);
  await page.getByRole('button', { name: 'Center' }).click();
  await page.getByRole('button', { name: 'Bold' }).click();
  await page.keyboard.press('ControlOrMeta+S');
  await expect(page.getByRole('status')).toHaveText('Saved');

  await page.reload();
  const html = await page.locator('.ProseMirror').innerHTML();
  expect(html).toMatch(/Georgia/);
  expect(html).toMatch(/font-size: ?18pt/);
  expect(html).toMatch(/text-align: ?center/);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download DOCX' }).click(),
  ]);
  const xml = await (await JSZip.loadAsync(await readDownload(download))).file('word/document.xml')!.async('string');
  expect(xml).toMatch(/Georgia/);
  expect(xml).toMatch(/w:sz w:val="36"/); // 18pt
  expect(xml).toMatch(/w:jc w:val="center"/);
});

test('Word-style editor: table tools appear when the cursor is in a table', async ({ page }) => {
  await page.goto('/docx/project-proposal');
  await page.getByRole('button', { name: 'Use this template' }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('tab', { name: 'Table Layout' })).toHaveCount(0);

  await page.locator('.ProseMirror td').first().click();
  await expect(page.getByRole('tab', { name: 'Table Layout' })).toBeVisible();
  await page.getByRole('tab', { name: 'Table Layout' }).click();
  const rows = page.locator('.ProseMirror tr');
  const before = await rows.count();
  await page.getByRole('button', { name: 'Insert row below' }).click();
  await expect(rows).toHaveCount(before + 1);
});

test('PowerPoint-style editor: edit text in place, save, reload, download', async ({ page }) => {
  await page.goto('/pptx');
  await page.getByRole('link', { name: 'Preview' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Use this template' }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);

  // The layout looks like PowerPoint: ribbon, thumbnail pane, a slide canvas, a status bar.
  await expect(page.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/Slide 1 of \d+/)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Slides' }).getByRole('button')).toHaveCount(6);
  await expect(page.getByTestId('slide-canvas')).toBeVisible();

  const title = page.locator('[data-editable]', { hasText: 'Startup Name' });
  await title.click({ clickCount: 3 });
  await page.keyboard.type('Acme Robotics');
  await page.getByRole('button', { name: 'Center' }).click();
  await expect(page.getByRole('status')).toHaveText('Unsaved changes');

  // Format a selection: select the subtitle text, make it italic and larger.
  const subtitle = page.locator('[data-editable]', { hasText: 'One sentence' });
  await subtitle.click({ clickCount: 3 });
  await page.getByRole('button', { name: 'Italic' }).click();
  await pickSize(page, 28);

  await page.keyboard.press('ControlOrMeta+S');
  await expect(page.getByRole('status')).toHaveText('Saved');

  await page.reload();
  const reloaded = page.locator('[data-editable]', { hasText: 'Acme Robotics' });
  await expect(reloaded).toBeVisible();
  await expect(reloaded.locator('div').first()).toHaveCSS('text-align', 'center');
  const sub = page.locator('[data-editable]', { hasText: 'One sentence' }).locator('span').first();
  await expect(sub).toHaveCSS('font-style', 'italic');
  await expect(sub).toHaveCSS('font-size', /^37\.3\d*px$/); // 28pt at 96 dpi; the exact size is asserted in the XML below

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download PPTX' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.pptx$/);
  const zip = await JSZip.loadAsync(await readDownload(download));
  const slide1 = await zip.file('ppt/slides/slide1.xml')!.async('string');
  expect(slide1).toContain('Acme Robotics');
  expect(slide1).toMatch(/i="1"/);
  expect(slide1).toMatch(/sz="2800"/);
  expect(slide1).toMatch(/algn="ctr"/);
});

test('PowerPoint-style editor: new slide, delete slide, slide show', async ({ page }) => {
  await page.goto('/pptx/lesson-plan');
  await page.getByRole('button', { name: 'Use this template' }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  const thumbs = page.getByRole('navigation', { name: 'Slides' }).getByRole('button');
  await expect(thumbs).toHaveCount(5);

  await page.getByRole('button', { name: 'Go to slide 3' }).click();
  await expect(page.getByText('Slide 3 of 5')).toBeVisible();
  await page.getByRole('button', { name: /New slide/ }).click();
  await expect(thumbs).toHaveCount(6);
  await expect(page.getByText('Slide 4 of 6')).toBeVisible();

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Delete slide' }).click();
  await expect(thumbs).toHaveCount(5);

  await page.getByRole('tab', { name: 'Slide Show' }).click();
  await page.getByRole('button', { name: 'From beginning' }).click();
  const show = page.getByRole('dialog', { name: 'Slide show' });
  await expect(show).toBeVisible();
  await expect(show).toContainText('1 / 5');
  await page.keyboard.press('ArrowRight');
  await expect(show).toContainText('2 / 5');
  await page.keyboard.press('Escape');
  await expect(show).toHaveCount(0);
});

test('created documents appear in My files', async ({ page }) => {
  await page.goto('/docx/invoice-simple');
  await page.getByRole('button', { name: 'Use this template' }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);

  await page.goto('/documents');
  await expect(page.getByRole('heading', { name: 'My files' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Simple Invoice' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download' }).first()).toBeVisible();
});

test('a file can be renamed in My files and the new name shows in the sidebar', async ({ page }) => {
  await page.goto('/docx/invoice-simple');
  await page.getByRole('button', { name: 'Use this template' }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);

  await page.goto('/documents');
  await page.getByRole('button', { name: 'Rename Simple Invoice' }).click();
  const field = page.getByRole('textbox', { name: 'Document name' });
  await expect(field).toBeFocused();
  await field.fill('Q3 invoice for Acme');
  await field.press('Enter');

  await expect(page.getByRole('heading', { name: 'Q3 invoice for Acme' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Q3 invoice for Acme' })).toBeVisible(); // sidebar "Recent"

  // Escape keeps the old name.
  await page.getByRole('button', { name: 'Rename Q3 invoice for Acme' }).click();
  await page.getByRole('textbox', { name: 'Document name' }).fill('Discarded');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Q3 invoice for Acme' })).toBeVisible();
  await expect(page.getByText('Discarded')).toHaveCount(0);
});

test('a file can be deleted after confirming, and disappears from My files and the sidebar', async ({ page }) => {
  await page.goto('/docx/invoice-simple');
  await page.getByRole('button', { name: 'Use this template' }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  const documentUrl = page.url();

  await page.goto('/documents');
  await expect(page.getByRole('heading', { name: 'Simple Invoice' })).toBeVisible();
  const recent = page.getByRole('region', { name: 'Recent' }).getByRole('link', { name: 'Simple Invoice' });
  await expect(recent).toBeVisible();

  // Cancel keeps the file.
  await page.getByRole('button', { name: 'Delete Simple Invoice' }).click();
  await expect(page.getByText('This cannot be undone.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Simple Invoice' })).toBeVisible();

  // Confirming removes it everywhere.
  await page.getByRole('button', { name: 'Delete Simple Invoice' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Simple Invoice' })).toHaveCount(0);
  await expect(page.getByText('You have not created anything yet')).toBeVisible();
  await expect(recent).toHaveCount(0);

  // The document itself is gone too.
  await page.goto(documentUrl);
  await expect(page.getByText('We could not find that document')).toBeVisible();
});

test('the sidebar lists at most the 20 most recent files', async ({ browser }) => {
  const context = await browser.newContext();
  for (let i = 0; i < 22; i++) {
    const response = await context.request.post('/api/templates/business-letter/use');
    expect(response.ok()).toBe(true);
  }
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Recent' }).getByRole('link')).toHaveCount(20);
  await context.close();
});

test('one visitor cannot open another visitor’s document', async ({ browser }) => {
  const owner = await browser.newContext();
  const ownerPage = await owner.newPage();
  await ownerPage.goto('/docx/business-letter');
  await ownerPage.getByRole('button', { name: 'Use this template' }).click();
  await expect(ownerPage).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  const url = ownerPage.url();

  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(url);
  await expect(strangerPage.getByText('We could not find that document')).toBeVisible();
  await owner.close();
  await stranger.close();
});

test('a missing document shows the not-found page', async ({ page }) => {
  await page.goto('/documents/00000000-0000-4000-8000-000000000000');
  await expect(page.getByText('We could not find that document')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Browse documents' })).toBeVisible();
});

test('an admin can add a template and it appears in the library', async ({ page }) => {
  await page.goto('/admin/templates');
  await page.getByLabel('Admin token').fill('dev-admin-token');
  await page.getByLabel('Template name').fill('Uploaded By E2E');
  await page.getByLabel('Category').fill('Testing');
  await page.getByLabel('Short description').fill('Template added by the end-to-end test.');
  await page.getByLabel(/File/).setInputFiles(path.join(SERVER_TEMPLATES, 'docx/business-letter/template.docx'));
  await page.getByRole('button', { name: 'Add template' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();

  await page.goto('/docx?q=Uploaded');
  await expect(page.getByRole('heading', { name: 'Uploaded By E2E' })).toBeVisible();
});

test('the admin form rejects a wrong token with a clear message', async ({ page }) => {
  await page.goto('/admin/templates');
  await page.getByLabel('Admin token').fill('definitely-wrong-token');
  await page.getByLabel('Template name').fill('Should Not Exist');
  await page.getByLabel('Category').fill('Testing');
  await page.getByLabel('Short description').fill('This upload must be rejected.');
  await page.getByLabel(/File/).setInputFiles(path.join(SERVER_TEMPLATES, 'docx/business-letter/template.docx'));
  await page.getByRole('button', { name: 'Add template' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'admin token' })).toBeVisible();
});
