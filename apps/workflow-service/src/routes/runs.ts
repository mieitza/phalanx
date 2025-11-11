import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createLogger } from '@phalanx/shared';
import type { WorkflowManager } from '../services/workflow-manager';

const logger = createLogger({ name: 'runs-route' });

const ApprovalSchema = z.object({
  approver: z.string(),
  comment: z.string().optional(),
});

export const runRoutes: FastifyPluginAsync = async (server) => {
  const workflowManager: WorkflowManager = (server as any).workflowManager;

  // Get run status
  server.get<{
    Params: { runId: string };
  }>('/:runId', async (request, reply) => {
    const { runId } = request.params;

    logger.info({ runId }, 'Getting run status');

    const status = workflowManager.getRunStatus(runId);

    if (!status) {
      return reply.status(404).send({
        error: 'Run not found',
      });
    }

    return status;
  });

  // Cancel run
  server.post<{
    Params: { runId: string };
  }>('/:runId/cancel', async (request, reply) => {
    const { runId } = request.params;

    logger.info({ runId }, 'Cancelling run');

    const success = workflowManager.cancelRun(runId);

    if (!success) {
      return reply.status(404).send({
        error: 'Run not found',
      });
    }

    return {
      status: 'cancelled',
    };
  });

  // Get pending approvals
  server.get<{
    Params: { runId: string };
  }>('/:runId/approvals', async (request, reply) => {
    const { runId } = request.params;

    logger.info({ runId }, 'Getting pending approvals');

    const approvals = workflowManager.getPendingApprovals(runId);

    return {
      pending: approvals.map(key => {
        const [, nodeId] = key.split(':');
        return { nodeId };
      }),
    };
  });

  // Approve node
  server.post<{
    Params: { runId: string; nodeId: string };
    Body: z.infer<typeof ApprovalSchema>;
  }>(
    '/:runId/approvals/:nodeId/approve',
    {
      schema: {
        body: ApprovalSchema,
      },
    },
    async (request, reply) => {
      const { runId, nodeId } = request.params;
      const { approver, comment } = request.body;

      logger.info({ runId, nodeId, approver }, 'Approving node');

      const success = workflowManager.approve(runId, nodeId, approver, comment);

      if (!success) {
        return reply.status(404).send({
          error: 'Approval not found or already processed',
        });
      }

      return {
        status: 'approved',
      };
    }
  );

  // Reject node
  server.post<{
    Params: { runId: string; nodeId: string };
    Body: z.infer<typeof ApprovalSchema>;
  }>(
    '/:runId/approvals/:nodeId/reject',
    {
      schema: {
        body: ApprovalSchema,
      },
    },
    async (request, reply) => {
      const { runId, nodeId } = request.params;
      const { approver, comment } = request.body;

      logger.info({ runId, nodeId, approver }, 'Rejecting node');

      const success = workflowManager.reject(runId, nodeId, approver, comment);

      if (!success) {
        return reply.status(404).send({
          error: 'Approval not found or already processed',
        });
      }

      return {
        status: 'rejected',
      };
    }
  );

  // Stream events (SSE)
  server.get<{
    Params: { runId: string };
  }>('/:runId/events', async (request, reply) => {
    const { runId } = request.params;

    logger.info({ runId }, 'Streaming workflow events');

    try {
      // Set up SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      // Subscribe to events
      const unsubscribe = workflowManager.subscribeToRun(runId, (event) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      });

      // Clean up on connection close
      request.raw.on('close', () => {
        unsubscribe();
        reply.raw.end();
      });
    } catch (error: any) {
      logger.error({ error, runId }, 'Failed to stream events');
      return reply.status(404).send({
        error: 'Run not found',
      });
    }
  });
};
