import { eq, desc, and } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema';
import { Execution, NewExecution, executions } from '../schema/executions';

export class ExecutionRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  async create(data: NewExecution): Promise<Execution> {
    const [execution] = await this.db.insert(executions).values(data).returning();
    return execution;
  }

  async findById(id: string, tenantId: string): Promise<Execution | undefined> {
    const [execution] = await this.db
      .select()
      .from(executions)
      .where(and(eq(executions.id, id), eq(executions.tenantId, tenantId)))
      .limit(1);
    return execution;
  }

  async findByRun(runId: string, tenantId: string): Promise<Execution[]> {
    return this.db
      .select()
      .from(executions)
      .where(and(eq(executions.runId, runId!), eq(executions.tenantId, tenantId)))
      .orderBy(desc(executions.createdAt));
  }

  async findByTenant(tenantId: string, limit = 50, offset = 0): Promise<Execution[]> {
    return this.db
      .select()
      .from(executions)
      .where(eq(executions.tenantId, tenantId))
      .orderBy(desc(executions.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async updateStatus(
    id: string,
    status: Execution['status'],
    data?: Partial<Pick<Execution, 'output' | 'error' | 'exitCode' | 'endedAt' | 'duration'>>
  ): Promise<Execution | undefined> {
    const [updated] = await this.db
      .update(executions)
      .set({ status, ...data })
      .where(eq(executions.id, id))
      .returning();
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(executions).where(eq(executions.id, id));
  }
}
