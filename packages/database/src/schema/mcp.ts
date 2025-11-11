import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  transport: text('transport').notNull(), // JSON string
  status: text('status').notNull(), // disconnected, connecting, connected, error
  serverInfo: text('server_info'), // JSON string
  tools: text('tools'), // JSON array
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});
