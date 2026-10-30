import type { Env } from './configs/env.js';
import type { Logger } from './utils/logger.js';
import type { DocumentsService } from '../modules/documents/documents.service.js';
import type { TemplateImporter } from '../modules/templates/template-importer.js';
import type { TemplatesService } from '../modules/templates/templates.service.js';
import type { PreviewGenerator } from '../infra/preview/preview-generator.js';

export interface AppVariables {
  sessionId: string;
}

export type AppBindings = { Variables: AppVariables };

/** Everything route modules need. Built once in `createApp`. */
export interface Services {
  env: Env;
  logger: Logger;
  templates: TemplatesService;
  documents: DocumentsService;
  importer: TemplateImporter;
  previews: PreviewGenerator;
}
