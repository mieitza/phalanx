import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Audit log table
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id'),
    action: text('action').notNull(), // e.g., "workflow.run", "tool.execute", "user.login"
    resource: text('resource'), // Resource ID (run, execution, etc.)
    resourceType: text('resource_type'), // Type of resource
    status: text('status', { enum: ['success', 'failure'] }).notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    metadata: text('metadata', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    tenantIdx: index('audit_log_tenant_idx').on(table.tenantId),
    userIdx: index('audit_log_user_idx').on(table.userId),
    actionIdx: index('audit_log_action_idx').on(table.action),
    createdIdx: index('audit_log_created_idx').on(table.createdAt),
  })
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
