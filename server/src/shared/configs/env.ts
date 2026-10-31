import path from 'node:path';
import { z } from 'zod';

/** Absolute path of the `server/` folder, independent of the working directory. */
export const SERVER_ROOT = path.resolve(import.meta.dirname, '../../..');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_PATH: z.string().default('data/app.db'),
  /** Source catalog (manifest-driven) consumed by `pnpm seed`. */
  CATALOG_DIR: z.string().default('templates'),
  /** Managed storage root; contains `templates/` and `documents/`. */
  STORAGE_DIR: z.string().default('storage'),
  /** Import the catalog (idempotent) every time the server starts. Set to "false" to manage templates only through the admin API. */
  AUTO_SEED: z.enum(['true', 'false']).default('true'),
  /** Worker threads for DOCX/PPTX conversions, so big documents never block the API. `0` runs them on the main thread. */
  DOC_WORKERS: z.coerce.number().int().min(0).max(8).default(1),
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(100).default(10),
  /** Token required by `/api/admin/*`. Mandatory in production. */
  /** Optional LibreOffice binary used to render previews of uploaded templates. */
  SOFFICE_PATH: z.string().optional(),
  PDFTOPPM_PATH: z.string().optional(),
});

export type Env = z.infer<typeof envSchema> & {
  databasePath: string;
  catalogDir: string;
  storageDir: string;
};

const resolveFromRoot = (value: string) =>
  path.isAbsolute(value) ? value : path.resolve(SERVER_ROOT, value);

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  return {
    ...env,
    databasePath:
      env.DATABASE_PATH === ':memory:' ? ':memory:' : resolveFromRoot(env.DATABASE_PATH),
    catalogDir: resolveFromRoot(env.CATALOG_DIR),
    storageDir: resolveFromRoot(env.STORAGE_DIR),
    // Development convenience only; never applied in production.
  };
}
