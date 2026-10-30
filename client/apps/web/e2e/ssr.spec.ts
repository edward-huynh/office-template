import { expect, test } from '@playwright/test';

/** The library must be fully usable without JavaScript: content is rendered on the server. */
test.describe('server-side rendering (JavaScript disabled)', () => {
  test.use({ javaScriptEnabled: false });

  test('the document library renders templates in the initial HTML', async ({ page }) => {
    const response = await page.goto('/docx');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Business Letter' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Simple Invoice' })).toBeVisible();
  });

  test('the home gallery lists both types and its Preview links work as plain links', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Business Letter' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Modern Pitch Deck' })).toBeVisible();
    await page.getByRole('link', { name: 'Preview' }).first().click();
    await expect(page).toHaveURL(/\/(docx|pptx)\/[a-z0-9-]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('the search form works with a plain GET request', async ({ page }) => {
    await page.goto('/docx');
    await page.getByRole('searchbox', { name: 'Search templates' }).fill('invoice');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/q=invoice/);
    await expect(page.getByRole('heading', { name: 'Simple Invoice' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Business Letter' })).toHaveCount(0);
  });

  test('category filters are real links', async ({ page }) => {
    await page.goto('/pptx');
    await page.getByRole('link', { name: 'Education' }).click();
    await expect(page).toHaveURL(/category=Education/);
    await expect(page.getByRole('heading', { name: 'Lesson Plan' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Modern Pitch Deck' })).toHaveCount(0);
  });

  test('a preview page includes social metadata for the template image', async ({ page }) => {
    await page.goto('/pptx/pitch-deck-modern');
    await expect(page.getByRole('heading', { level: 1, name: 'Modern Pitch Deck' })).toBeVisible();
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/api\/templates\/pitch-deck-modern\/thumbnail/);
    await expect(page.getByRole('img', { name: /slide 6/ })).toBeAttached();
  });
});

test.describe('HTTP status codes', () => {
  test('an unknown template is a real 404', async ({ request }) => {
    const response = await request.get('/docx/does-not-exist');
    expect(response.status()).toBe(404);
    expect(await response.text()).toContain('We could not find that template');
  });

  test('a template of the other type is a 404 too', async ({ request }) => {
    expect((await request.get('/pptx/business-letter')).status()).toBe(404);
  });

  test('an unknown route is a 404', async ({ request }) => {
    expect((await request.get('/nothing-here')).status()).toBe(404);
  });
});
