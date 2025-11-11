import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { WorkflowSchema } from '@phalanx/schemas';
import { createLogger } from '@phalanx/shared';
import type { WorkflowManager } from '../services/workflow-manager';

const logger = createLogger({ name: 'workflows-route' });

const CreateWorkflowSchema = WorkflowSchema;

const StartRunSchema = z.object({
  inputs: z.record(z.unknown()).optional(),
});

export const workflowRoutes: FastifyPluginAsync = async (server) => {
  const workflowManager: WorkflowManager = (server as any).workflowManager;

  // Create workflow
  server.post<{
    Body: z.infer<typeof CreateWorkflowSchema>;
  }>(
    '/',
    {
      schema: {
        body: CreateWorkflowSchema,
      },
    },
    async (request, reply) => {
      const workflow = request.body;
      const tenantId = 'default'; // TODO: Get from auth context

      logger.info({ workflowId: workflow.id }, 'Creating workflow');

      try {
        const created = await workflowManager.createWorkflow(workflow, tenantId);
        return reply.status(201).send(created);
      } catch (error: any) {
        logger.error({ error, workflowId: workflow.id }, 'Failed to create workflow');
        return reply.status(500).send({
          error: 'Failed to create workflow',
          message: error.message,
        });
      }
    }
  );

  // Get workflow
  server.get<{
    Params: { workflowId: string };
  }>('/:workflowId', async (request, reply) => {
    const { workflowId } = request.params;
    const tenantId = 'default'; // TODO: Get from auth context

    logger.info({ workflowId }, 'Getting workflow');

    try {
      const workflow = await workflowManager.getWorkflow(workflowId, tenantId);

      if (!workflow) {
        return reply.status(404).send({
          error: 'Workflow not found',
        });
      }

      return workflow;
    } catch (error: any) {
      logger.error({ error, workflowId }, 'Failed to get workflow');
      return reply.status(500).send({
        error: 'Failed to get workflow',
        message: error.message,
      });
    }
  });

  // Start workflow run
  server.post<{
    Params: { workflowId: string };
    Body: z.infer<typeof StartRunSchema>;
  }>(
    '/:workflowId/runs',
    {
      schema: {
        body: StartRunSchema,
      },
    },
    async (request, reply) => {
      const { workflowId } = request.params;
      const { inputs } = request.body;
      const tenantId = 'default'; // TODO: Get from auth context

      logger.info({ workflowId }, 'Starting workflow run');

      try {
        const runId = await workflowManager.startRun(workflowId, tenantId, inputs);

        return reply.status(201).send({
          runId,
          status: 'running',
        });
      } catch (error: any) {
        logger.error({ error, workflowId }, 'Failed to start run');
        return reply.status(500).send({
          error: 'Failed to start run',
          message: error.message,
        });
      }
    }
  );
};
