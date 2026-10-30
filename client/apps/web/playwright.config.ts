import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests run against a production build with its own API instance and database
 * (ports 4001/4000), so they never touch your development data.
 *
 * Uses the locally installed Google Chrome. To use Playwright's bundled Chromium instead, run
 * `pnpm exec playwright install chromium` and remove `channel`.
 */
const API_PORT = 4001;
const WEB_PORT = 4000;
const apiUrl = `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // A fresh database and storage every run, so counts and "recent files" are deterministic.
      command: 'rm -rf data/e2e.db data/e2e.db-wal data/e2e.db-shm storage/e2e && pnpm start',
      cwd: '../../../server',
      url: `${apiUrl}/api/health`,
      env: { PORT: String(API_PORT), DATABASE_PATH: 'data/e2e.db', STORAGE_DIR: 'storage/e2e', LOG_LEVEL: 'warn' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm build && pnpm start',
      url: `http://localhost:${WEB_PORT}/docx`,
      env: {
        PORT: String(WEB_PORT),
        API_INTERNAL_URL: apiUrl,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
