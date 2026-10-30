import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const templates = sqliteTable(
  'templates',
  {
    id: text('id').primaryKey(),
    type: text('type', { enum: ['docx', 'pptx'] }).notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    description: text('description').notNull(),
    version: integer('version').notNull().default(1),
    /** Hidden templates (such as the blank starters) are reachable by id but not listed in the gallery. */
    hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
    /** Keys below are relative to the managed template store. */
    filePath: text('file_path').notNull(),
    thumbnailPath: text('thumbnail_path').notNull(),
    previewPages: text('preview_pages', { mode: 'json' }).$type<string[]>().notNull(),
    checksum: text('checksum').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('templates_type_idx').on(table.type), index('templates_category_idx').on(table.category)],
);

export const documents = sqliteTable(
  'documents',
  {
    id: text('id').primaryKey(),
    templateId: text('template_id')
      .notNull()
      .references(() => templates.id),
    templateVersion: integer('template_version').notNull(),
    type: text('type', { enum: ['docx', 'pptx'] }).notNull(),
    title: text('title').notNull(),
    ownerSessionId: text('owner_session_id').notNull(),
    /** Key relative to the managed document store. */
    filePath: text('file_path').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('documents_owner_idx').on(table.ownerSessionId)],
);

export type TemplateRow = typeof templates.$inferSelect;
export type NewTemplateRow = typeof templates.$inferInsert;
export type DocumentRow = typeof documents.$inferSelect;
export type NewDocumentRow = typeof documents.$inferInsert;
