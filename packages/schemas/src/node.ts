import { z } from 'zod';

export const NodeTypeSchema = z.enum([
  'prompt',
  'tool',
  'decision',
  'parallel',
  'loop',
  'wait',
  'approval',
]);

export const NodeSchema = z.object({
  id: z.string(),
  type: NodeTypeSchema,
  spec: z.record(z.unknown()),
  result: z.record(z.unknown()).optional(),
  retries: z.number().int().min(0).default(0),
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'canceled']).optional(),
  error: z
    .object({
      message: z.string(),
      code: z.string().optional(),
      stack: z.string().optional(),
    })
    .optional(),
});

export type Node = z.infer<typeof NodeSchema>;
export type NodeType = z.infer<typeof NodeTypeSchema>;
