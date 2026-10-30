/**
 * Imports the manifest-driven catalog (server/templates) into the managed template store and the
 * database. The server does the same automatically when it starts; run this to import by hand
 * (for example after adding a template while the server is not running).
 */
import path from 'node:path';
import { createDb } from '../src/infra/db/client.js';
import { LocalFileStore } from '../src/infra/storage/file-store.js';
import { seedCatalog } from '../src/modules/templates/seed-catalog.js';
import { TemplateImporter } from '../src/modules/templates/template-importer.js';
import { TemplatesRepository } from '../src/modules/templates/templates.repository.js';
import { parseEnv } from '../src/shared/configs/env.js';

const env = parseEnv();
const db = createDb(env.databasePath);
const importer = new TemplateImporter(
  new TemplatesRepository(db),
  new LocalFileStore(path.join(env.storageDir, 'templates')),
);

const result = await seedCatalog(importer, env.catalogDir, (status, row) =>
  console.log(`  ${status.padEnd(9)} ${row.type}/${row.id}  v${row.version}`),
);
for (const failure of result.failed) console.error(`  FAILED    ${failure.id}: ${failure.message}`);
if (result.total === 0) {
  console.error(`No templates found in ${env.catalogDir}. Run "pnpm generate:templates" first.`);
  process.exitCode = 1;
}
if (result.failed.length > 0) process.exitCode = 1;
console.log(`Seed finished: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged.`);
db.$client.close();
