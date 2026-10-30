import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { createDb } from '../src/infra/db/client.js';
import { PlaceholderPreviewGenerator } from '../src/infra/preview/preview-generator.js';
import { LocalFileStore } from '../src/infra/storage/file-store.js';
import { loadCatalog, readCatalogEntry } from '../src/modules/templates/manifest-loader.js';
import { TemplateImporter } from '../src/modules/templates/template-importer.js';
import { TemplatesRepository } from '../src/modules/templates/templates.repository.js';
import { parseEnv, SERVER_ROOT } from '../src/shared/configs/env.js';
import { createLogger } from '../src/shared/utils/logger.js';

export const ADMIN_TOKEN = 'test-admin-token';
export const CATALOG_DIR = path.join(SERVER_ROOT, 'templates');

/** A client that keeps its cookie jar, like a browser tab. */
export class Session {
  private cookie = '';
  constructor(private readonly app: ReturnType<typeof createApp>) {}

  async request(url: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
    if (this.cookie) headers.cookie = this.cookie;
    const response = await this.app.request(url, { ...init, headers });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0]!;
    return response;
  }

  async json<T = any>(url: string, init?: RequestInit & { headers?: Record<string, string> }) {
    const response = await this.request(url, init);
    return { status: response.status, body: (await response.json()) as T, headers: response.headers };
  }
}

export async function createTestContext(overrides: Record<string, string> = {}, handlers?: Parameters<typeof createApp>[0]['handlers']) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'office-template-test-'));
  const env = parseEnv({
    NODE_ENV: 'test',
    DATABASE_PATH: ':memory:',
    STORAGE_DIR: root,
    CATALOG_DIR,
    MAX_UPLOAD_MB: '1',
    ADMIN_TOKEN,
    ...overrides,
  } as NodeJS.ProcessEnv);

  const db = createDb(env.databasePath);
  const templateStore = new LocalFileStore(path.join(root, 'templates'));
  const documentStore = new LocalFileStore(path.join(root, 'documents'));
  const logger = createLogger('silent', 'test');
  const app = createApp({ env, logger, db, templateStore, documentStore, previews: new PlaceholderPreviewGenerator(), handlers });

  const importer = new TemplateImporter(new TemplatesRepository(db), templateStore);
  for (const entry of await loadCatalog(CATALOG_DIR)) {
    await importer.import(await readCatalogEntry(entry));
  }

  return {
    app,
    env,
    db,
    root,
    templateStore,
    documentStore,
    session: () => new Session(app),
    cleanup: async () => {
      db.$client.close();
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

export const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

/** Hash of every file under a directory, keyed by relative path. Detects any write to the template store. */
export async function snapshotDir(dir: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const walk = async (current: string) => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else result[path.relative(dir, full)] = sha256(await fs.readFile(full));
    }
  };
  await walk(dir);
  return result;
}
