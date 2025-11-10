import { z } from 'zod';
import { NodeSchema } from './node';

export const RunStatusSchema = z.enum([
  'queued',
  'running',
  'waiting',
  'succeeded',
  'failed',
  'canceled',
]);

export const RunSchema = z.object({
  id: z.string(),
  tenant: z.string(),
  workflowId: z.string(),
  status: RunStatusSchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  nodes: z.array(NodeSchema),
  metadata: z.record(z.unknown()).optional(),
});

export type Run = z.infer<typeof RunSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
