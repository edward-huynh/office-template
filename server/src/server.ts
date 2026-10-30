import path from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { createDb } from './infra/db/client.js';
import { createPreviewGenerator } from './infra/preview/preview-generator.js';
import { LocalFileStore } from './infra/storage/file-store.js';
import { DocumentPool } from './infra/workers/document-pool.js';
import { pooledHandlers } from './doctypes/pooled.js';
import { seedCatalog } from './modules/templates/seed-catalog.js';
import { TemplateImporter } from './modules/templates/template-importer.js';
import { TemplatesRepository } from './modules/templates/templates.repository.js';
import { parseEnv } from './shared/configs/env.js';
import { createLogger } from './shared/utils/logger.js';
import { registerGracefulShutdown } from './shared/utils/shutdown.js';

const env = parseEnv();
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV);

const db = createDb(env.databasePath);
const templateStore = new LocalFileStore(path.join(env.storageDir, 'templates'));

// First run (or a catalog that changed since the last run): import the sample templates before
// accepting requests. When everything is already imported this only compares checksums.
if (env.AUTO_SEED === 'true') {
  try {
    const seeded = await seedCatalog(new TemplateImporter(new TemplatesRepository(db), templateStore), env.catalogDir);
    if (seeded.created + seeded.updated > 0) {
      logger.info(`Template catalog imported: ${seeded.created} created, ${seeded.updated} updated, ${seeded.unchanged} unchanged`);
    } else {
      logger.info(`Template catalog already imported (${seeded.unchanged} templates up to date)`);
    }
    for (const failure of seeded.failed) logger.error(`Could not import ${failure.id}: ${failure.message}`);
  } catch (error) {
    // A broken catalog must not take the API down: it keeps serving what is already in the database.
    logger.error({ err: error }, 'Template catalog could not be read; starting with the templates already imported');
  }
}

const documentPool = new DocumentPool({ threads: env.DOC_WORKERS, logger });
if (documentPool.threads > 0) logger.info(`Document conversions run in ${documentPool.threads} worker thread(s)`);

const app = createApp({
  env,
  logger,
  db,
  templateStore,
  documentStore: new LocalFileStore(path.join(env.storageDir, 'documents')),
  handlers: documentPool.threads > 0 ? pooledHandlers(documentPool) : undefined,
  previews: await createPreviewGenerator({ sofficePath: env.SOFFICE_PATH, pdftoppmPath: env.PDFTOPPM_PATH }, logger),
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info(`API listening on http://localhost:${info.port} (docs: /api/docs)`);
});

registerGracefulShutdown(server as import('node:http').Server, logger, () => {
  void documentPool.close();
  db.$client.close();
});
