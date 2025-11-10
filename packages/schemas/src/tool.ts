import { z } from 'zod';

export const ToolKindSchema = z.enum(['shell', 'http', 'mcp']);

export const ToolPolicySchema = z.object({
  confirm: z.boolean().default(false),
  allowlist: z.array(z.string()).optional(),
  blocklist: z.array(z.string()).optional(),
  timeout: z.number().int().positive().optional(),
  retries: z.number().int().min(0).max(5).optional(),
});

export const ToolSchema = z.object({
  name: z.string(),
  kind: ToolKindSchema,
  description: z.string().optional(),
  schema: z.record(z.unknown()),
  policy: ToolPolicySchema.optional(),
  version: z.string().optional(),
});

export const ToolExecutionRequestSchema = z.object({
  tool: z.string(),
  args: z.record(z.unknown()),
  policy: ToolPolicySchema.optional(),
  context: z
    .object({
      runId: z.string(),
      tenant: z.string(),
      userId: z.string().optional(),
    })
    .optional(),
});

export const ToolResultSchema = z.object({
  status: z.enum(['success', 'error', 'canceled']),
  llmContent: z.union([z.string(), z.record(z.unknown())]),
  displayContent: z.string().optional(),
  exitCode: z.number().int().optional(),
  duration: z.number(),
  files: z
    .array(
      z.object({
        path: z.string(),
        mimeType: z.string(),
        size: z.number(),
      })
    )
    .optional(),
  metadata: z.record(z.unknown()).optional(),
  error: z
    .object({
      type: z.string(),
      message: z.string(),
      stack: z.string().optional(),
    })
    .optional(),
});

export type Tool = z.infer<typeof ToolSchema>;
export type ToolKind = z.infer<typeof ToolKindSchema>;
export type ToolPolicy = z.infer<typeof ToolPolicySchema>;
export type ToolExecutionRequest = z.infer<typeof ToolExecutionRequestSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;
