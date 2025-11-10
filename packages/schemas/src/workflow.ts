import { z } from 'zod';
import { NodeSchema } from './node';

export const WorkflowInputSchema = z.record(z.unknown());

export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string().default('1.0.0'),
  inputs: z.record(
    z.object({
      type: z.string(),
      description: z.string().optional(),
      required: z.boolean().default(false),
      default: z.unknown().optional(),
    })
  ),
  vars: z.record(z.unknown()).optional(),
  nodes: z.array(NodeSchema),
  edges: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        condition: z.string().optional(),
      })
    )
    .optional(),
});

export const WorkflowRunRequestSchema = z.object({
  workflowId: z.string(),
  inputs: WorkflowInputSchema,
  options: z
    .object({
      resumeFrom: z.string().optional(),
      dryRun: z.boolean().default(false),
    })
    .optional(),
});

export type Workflow = z.infer<typeof WorkflowSchema>;
export type WorkflowInput = z.infer<typeof WorkflowInputSchema>;
export type WorkflowRunRequest = z.infer<typeof WorkflowRunRequestSchema>;
