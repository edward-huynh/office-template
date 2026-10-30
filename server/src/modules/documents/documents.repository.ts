import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../infra/db/client.js';
import { documents, type DocumentRow, type NewDocumentRow } from '../../infra/db/schema.js';

export class DocumentsRepository {
  constructor(private readonly db: Db) {}

  insert(row: NewDocumentRow): void {
    this.db.insert(documents).values(row).run();
  }

  /** Owner scoping lives in the query, so a document of another session is indistinguishable from a missing one. */
  findOwned(id: string, ownerSessionId: string): DocumentRow | undefined {
    return this.db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.ownerSessionId, ownerSessionId)))
      .get();
  }

  listByOwner(ownerSessionId: string, limit?: number): DocumentRow[] {
    const query = this.db
      .select()
      .from(documents)
      .where(eq(documents.ownerSessionId, ownerSessionId))
      .orderBy(desc(documents.updatedAt));
    return (limit ? query.limit(limit) : query).all();
  }

  update(id: string, patch: Partial<Pick<DocumentRow, 'title' | 'sizeBytes' | 'updatedAt'>>): void {
    this.db.update(documents).set(patch).where(eq(documents.id, id)).run();
  }
}
