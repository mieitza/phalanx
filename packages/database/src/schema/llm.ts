import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// LLM requests table (for usage tracking and cost accounting)
export const llmRequests = sqliteTable(
  'llm_requests',
  {
    id: text('id').primaryKey(),
    runId: text('run_id'), // Optional link to workflow run
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id'),
    provider: text('provider').notNull(), // openai, anthropic, ollama
    model: text('model').notNull(),
    promptTokens: integer('prompt_tokens').notNull(),
    completionTokens: integer('completion_tokens').notNull(),
    totalTokens: integer('total_tokens').notNull(),
    costUsd: integer('cost_usd'), // Store as cents (integer)
    latencyMs: integer('latency_ms').notNull(),
    cached: integer('cached', { mode: 'boolean' }).notNull().default(false),
    metadata: text('metadata', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    runIdx: index('llm_requests_run_idx').on(table.runId),
    tenantIdx: index('llm_requests_tenant_idx').on(table.tenantId),
    providerIdx: index('llm_requests_provider_idx').on(table.provider),
    createdIdx: index('llm_requests_created_idx').on(table.createdAt),
  })
);

export type LlmRequest = typeof llmRequests.$inferSelect;
export type NewLlmRequest = typeof llmRequests.$inferInsert;
