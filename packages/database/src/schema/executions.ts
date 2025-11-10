import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Tool executions table
export const executions = sqliteTable(
  'executions',
  {
    id: text('id').primaryKey(),
    runId: text('run_id'), // Optional link to workflow run
    nodeId: text('node_id'), // Optional link to run node
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id'),
    tool: text('tool').notNull(),
    status: text('status', {
      enum: ['pending', 'running', 'completed', 'failed', 'canceled'],
    }).notNull(),
    command: text('command'),
    executor: text('executor', { enum: ['shell', 'docker'] }).notNull(),
    exitCode: integer('exit_code'),
    output: text('output'),
    error: text('error'),
    metadata: text('metadata', { mode: 'json' }),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    endedAt: integer('ended_at', { mode: 'timestamp' }),
    duration: integer('duration'), // milliseconds
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    runIdx: index('executions_run_idx').on(table.runId),
    tenantIdx: index('executions_tenant_idx').on(table.tenantId),
    statusIdx: index('executions_status_idx').on(table.status),
    createdIdx: index('executions_created_idx').on(table.createdAt),
  })
);

export type Execution = typeof executions.$inferSelect;
export type NewExecution = typeof executions.$inferInsert;
