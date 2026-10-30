import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import type { DocType, TemplateListQuery } from '../../contracts/index.js';
import type { Db } from '../../infra/db/client.js';
import { templates, type NewTemplateRow, type TemplateRow } from '../../infra/db/schema.js';

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export class TemplatesRepository {
  constructor(private readonly db: Db) {}

  list(query: TemplateListQuery): { rows: TemplateRow[]; total: number } {
    const conditions: SQL[] = [eq(templates.hidden, false)];
    if (query.type) conditions.push(eq(templates.type, query.type));
    if (query.category) conditions.push(eq(templates.category, query.category));
    if (query.q) {
      const pattern = `%${escapeLike(query.q)}%`;
      conditions.push(
        sql`(${templates.name} LIKE ${pattern} ESCAPE '\\' OR ${templates.description} LIKE ${pattern} ESCAPE '\\' OR ${templates.category} LIKE ${pattern} ESCAPE '\\')`,
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = this.db
      .select()
      .from(templates)
      .where(where)
      .orderBy(asc(templates.category), asc(templates.name))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize)
      .all();
    const [{ total } = { total: 0 }] = this.db
      .select({ total: sql<number>`count(*)` })
      .from(templates)
      .where(where)
      .all();
    return { rows, total };
  }

  categories(type?: DocType): string[] {
    const rows = this.db
      .selectDistinct({ category: templates.category })
      .from(templates)
      .where(type ? and(eq(templates.hidden, false), eq(templates.type, type)) : eq(templates.hidden, false))
      .orderBy(asc(templates.category))
      .all();
    return rows.map((row) => row.category);
  }

  findById(id: string): TemplateRow | undefined {
    return this.db.select().from(templates).where(eq(templates.id, id)).get();
  }

  upsert(row: NewTemplateRow): void {
    this.db
      .insert(templates)
      .values(row)
      .onConflictDoUpdate({
        target: templates.id,
        set: {
          type: row.type,
          name: row.name,
          category: row.category,
          description: row.description,
          version: row.version,
          hidden: row.hidden,
          filePath: row.filePath,
          thumbnailPath: row.thumbnailPath,
          previewPages: row.previewPages,
          checksum: row.checksum,
          updatedAt: row.updatedAt,
        },
      })
      .run();
  }
}
