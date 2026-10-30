import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { secureHeaders } from 'hono/secure-headers';
import type { DocType } from './contracts/index.js';
import type { DocTypeHandler } from './doctypes/types.js';
import type { Db } from './infra/db/client.js';
import type { FileStore } from './infra/storage/file-store.js';
import type { PreviewGenerator } from './infra/preview/preview-generator.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { DocumentsRepository } from './modules/documents/documents.repository.js';
import { documentsRoutes } from './modules/documents/documents.routes.js';
import { DocumentsService } from './modules/documents/documents.service.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { TemplateImporter } from './modules/templates/template-importer.js';
import { TemplatesRepository } from './modules/templates/templates.repository.js';
import { templatesRoutes } from './modules/templates/templates.routes.js';
import { TemplatesService } from './modules/templates/templates.service.js';
import type { Env } from './shared/configs/env.js';
import { adminAuth } from './shared/middlewares/admin-auth.js';
import { createErrorHandler, notFoundHandler } from './shared/middlewares/error-handler.js';
import { requestLogger } from './shared/middlewares/request-logger.js';
import { noStore } from './shared/middlewares/no-store.js';
import { sessionMiddleware } from './shared/middlewares/session.js';
import type { AppBindings, Services } from './shared/types.js';
import { validationError } from './shared/utils/api-response.js';
import type { Logger } from './shared/utils/logger.js';

export interface AppDeps {
  env: Env;
  logger: Logger;
  db: Db;
  /** Managed template store. Only the importer receives write access. */
  templateStore: FileStore;
  documentStore: FileStore;
  previews: PreviewGenerator;
  /** Heavy document operations run here when given (see `pooledHandlers`); otherwise on the calling thread. */
  handlers?: (type: DocType) => DocTypeHandler;
}

/** Wires repositories, services and routes. Tests call this with temporary stores and an in-memory DB. */
export function createApp(deps: AppDeps) {
  const { env, logger, db } = deps;

  const templatesRepository = new TemplatesRepository(db);
  const templates = new TemplatesService(templatesRepository, deps.templateStore.asReadOnly());
  const documents = new DocumentsService(
    new DocumentsRepository(db),
    templates,
    deps.templateStore.asReadOnly(),
    deps.documentStore,
    deps.handlers,
  );
  const importer = new TemplateImporter(templatesRepository, deps.templateStore);
  const services: Services = { env, logger, templates, documents, importer, previews: deps.previews };

  const api = new OpenAPIHono<AppBindings>({
    defaultHook: (result) => {
      if (!result.success) throw validationError(result.error);
    },
  });

  api.openAPIRegistry.registerComponent('securitySchemes', 'adminToken', {
    type: 'apiKey',
    in: 'header',
    name: 'x-admin-token',
  });
  api.doc('/openapi.json', {
    openapi: '3.0.3',
    info: {
      title: 'Office Template Library API',
      version: '1.0.0',
      description: 'Template catalog and copy-on-use document API for DOCX and PPTX.',
    },
    servers: [{ url: '/api' }],
  });
  api.get('/docs', swaggerUI({ url: '/api/openapi.json' }));

  const routes = api
    .use('*', sessionMiddleware({ secure: env.NODE_ENV === 'production' && process.env.COOKIE_SECURE === 'true' }))
    .use('/admin/*', adminAuth(env.adminToken))
    .use('/documents', noStore)
    .use('/documents/*', noStore)
    .route('/health', healthRoutes())
    .route('/templates', templatesRoutes(templates))
    .route('/', documentsRoutes(documents))
    .route('/admin', adminRoutes(services));

  return new OpenAPIHono()
    .use('*', secureHeaders())
    .use('*', requestLogger(logger))
    .route('/api', routes)
    .onError(createErrorHandler(logger, env.NODE_ENV !== 'production'))
    .notFound(notFoundHandler);
}

export type App = ReturnType<typeof createApp>;
