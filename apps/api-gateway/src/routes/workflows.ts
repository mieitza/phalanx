import { FastifyPluginAsync } from 'fastify';
import { WorkflowRunRequestSchema, RunSchema } from '@phalanx/schemas';

const workflowRoutes: FastifyPluginAsync = async (server) => {
  // Create a new workflow run
  server.post(
    '/run',
    {
      onRequest: [server.authenticate, server.authorize(['admin', 'operator', 'developer'])],
      schema: {
        body: WorkflowRunRequestSchema,
        response: {
          202: RunSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as any;

      // TODO: Send workflow run request to workflow engine via message queue
      const runId = `run_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      return reply.status(202).send({
        id: runId,
        tenant: request.user!.tenantId,
        workflowId: body.workflowId,
        status: 'queued',
        startedAt: new Date().toISOString(),
        nodes: [],
      });
    }
  );

  // Get workflow run status
  server.get(
    '/:runId',
    {
      onRequest: [server.authenticate],
    },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };

      // TODO: Fetch run status from database
      return reply.send({
        id: runId,
        tenant: request.user!.tenantId,
        workflowId: 'example_workflow',
        status: 'running',
        startedAt: new Date().toISOString(),
        nodes: [],
      });
    }
  );

  // Stream workflow events (SSE)
  server.get(
    '/:runId/events',
    {
      onRequest: [server.authenticate],
    },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      // Send initial event
      reply.raw.write(`data: ${JSON.stringify({ type: 'connected', runId })}\n\n`);

      // TODO: Subscribe to workflow events from message bus
      // For now, send a heartbeat every 10 seconds
      const interval = setInterval(() => {
        reply.raw.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
      }, 10000);

      request.raw.on('close', () => {
        clearInterval(interval);
        reply.raw.end();
      });
    }
  );

  // Cancel workflow run
  server.delete(
    '/:runId',
    {
      onRequest: [server.authenticate, server.authorize(['admin', 'operator', 'developer'])],
    },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };

      // TODO: Send cancellation request to workflow engine
      return reply.send({
        id: runId,
        status: 'canceled',
        message: 'Workflow run cancellation requested',
      });
    }
  );

  // List workflow runs
  server.get(
    '/',
    {
      onRequest: [server.authenticate],
    },
    async (request, reply) => {
      const { limit = 50, offset = 0 } = request.query as { limit?: number; offset?: number };

      // TODO: Fetch runs from database
      return reply.send({
        runs: [],
        total: 0,
        limit,
        offset,
      });
    }
  );
};

export { workflowRoutes };
