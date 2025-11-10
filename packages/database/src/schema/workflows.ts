import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Workflows table
export const workflows = sqliteTable(
  'workflows',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    version: text('version').notNull().default('1.0.0'),
    tenantId: text('tenant_id').notNull(),
    definition: text('definition', { mode: 'json' }).notNull(), // JSON workflow definition
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    tenantIdx: index('workflows_tenant_idx').on(table.tenantId),
    nameIdx: index('workflows_name_idx').on(table.name),
  })
);

// Workflow runs table
export const runs = sqliteTable(
  'runs',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id'),
    status: text('status', {
      enum: ['queued', 'running', 'waiting', 'succeeded', 'failed', 'canceled'],
    }).notNull(),
    inputs: text('inputs', { mode: 'json' }),
    outputs: text('outputs', { mode: 'json' }),
    error: text('error', { mode: 'json' }),
    metadata: text('metadata', { mode: 'json' }),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    endedAt: integer('ended_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    workflowIdx: index('runs_workflow_idx').on(table.workflowId),
    tenantIdx: index('runs_tenant_idx').on(table.tenantId),
    statusIdx: index('runs_status_idx').on(table.status),
    createdIdx: index('runs_created_idx').on(table.createdAt),
  })
);

// Run nodes (execution steps)
export const runNodes = sqliteTable(
  'run_nodes',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    nodeId: text('node_id').notNull(), // From workflow definition
    type: text('type', {
      enum: ['prompt', 'tool', 'decision', 'parallel', 'loop', 'wait', 'approval'],
    }).notNull(),
    status: text('status', {
      enum: ['pending', 'running', 'succeeded', 'failed', 'canceled'],
    }).notNull(),
    inputs: text('inputs', { mode: 'json' }),
    outputs: text('outputs', { mode: 'json' }),
    error: text('error', { mode: 'json' }),
    retries: integer('retries').notNull().default(0),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    endedAt: integer('ended_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    runIdx: index('run_nodes_run_idx').on(table.runId),
    statusIdx: index('run_nodes_status_idx').on(table.status),
  })
);

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type RunNode = typeof runNodes.$inferSelect;
export type NewRunNode = typeof runNodes.$inferInsert;
