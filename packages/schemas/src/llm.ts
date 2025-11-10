import { z } from 'zod';

export const MessageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);

export const MessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.string(),
  name: z.string().optional(),
  toolCalls: z
    .array(
      z.object({
        id: z.string(),
        type: z.literal('function'),
        function: z.object({
          name: z.string(),
          arguments: z.string(),
        }),
      })
    )
    .optional(),
  toolCallId: z.string().optional(),
});

export const CompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(MessageSchema),
  tools: z
    .array(
      z.object({
        type: z.literal('function'),
        function: z.object({
          name: z.string(),
          description: z.string().optional(),
          parameters: z.record(z.unknown()),
        }),
      })
    )
    .optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  stream: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

export const UsageSchema = z.object({
  promptTokens: z.number().int(),
  completionTokens: z.number().int(),
  totalTokens: z.number().int(),
});

export const CompletionResponseSchema = z.object({
  id: z.string(),
  model: z.string(),
  content: z.string().optional(),
  toolCalls: z
    .array(
      z.object({
        id: z.string(),
        type: z.literal('function'),
        function: z.object({
          name: z.string(),
          arguments: z.string(),
        }),
      })
    )
    .optional(),
  usage: UsageSchema,
  finishReason: z.enum(['stop', 'length', 'tool_calls', 'content_filter']).optional(),
});

export const ProviderConfigSchema = z.object({
  type: z.enum(['openai', 'anthropic', 'ollama', 'openai-compatible']),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  model: z.string(),
  timeout: z.number().int().positive().default(60000),
  maxRetries: z.number().int().min(0).max(5).default(3),
});

export type Message = z.infer<typeof MessageSchema>;
export type MessageRole = z.infer<typeof MessageRoleSchema>;
export type CompletionRequest = z.infer<typeof CompletionRequestSchema>;
export type CompletionResponse = z.infer<typeof CompletionResponseSchema>;
export type Usage = z.infer<typeof UsageSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
