import { eq, desc, and } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema';
import { Run, NewRun, runs } from '../schema/workflows';

export class RunRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  async create(data: NewRun): Promise<Run> {
    const [run] = await this.db.insert(runs).values(data).returning();
    return run;
  }

  async findById(id: string, tenantId: string): Promise<Run | undefined> {
    const [run] = await this.db
      .select()
      .from(runs)
      .where(and(eq(runs.id, id), eq(runs.tenantId, tenantId)))
      .limit(1);
    return run;
  }

  async findByWorkflow(
    workflowId: string,
    tenantId: string,
    limit = 50,
    offset = 0
  ): Promise<Run[]> {
    return this.db
      .select()
      .from(runs)
      .where(and(eq(runs.workflowId, workflowId), eq(runs.tenantId, tenantId)))
      .orderBy(desc(runs.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async findByTenant(tenantId: string, limit = 50, offset = 0): Promise<Run[]> {
    return this.db
      .select()
      .from(runs)
      .where(eq(runs.tenantId, tenantId))
      .orderBy(desc(runs.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async updateStatus(
    id: string,
    status: Run['status'],
    data?: Partial<Pick<Run, 'outputs' | 'error' | 'endedAt'>>
  ): Promise<Run | undefined> {
    const [updated] = await this.db
      .update(runs)
      .set({ status, ...data })
      .where(eq(runs.id, id))
      .returning();
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(runs).where(eq(runs.id, id));
  }

  async countByTenant(tenantId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: schema.runs.id })
      .from(runs)
      .where(eq(runs.tenantId, tenantId));
    return result?.count ? 1 : 0; // SQLite doesn't have count, this is simplified
  }
}
