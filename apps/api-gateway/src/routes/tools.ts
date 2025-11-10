import { FastifyPluginAsync } from 'fastify';
import { ToolExecutionRequestSchema, ToolResultSchema } from '@phalanx/schemas';

const toolRoutes: FastifyPluginAsync = async (server) => {
  // Execute a tool
  server.post(
    '/exec',
    {
      onRequest: [server.authenticate, server.authorize(['admin', 'operator', 'developer'])],
      schema: {
        body: ToolExecutionRequestSchema,
        response: {
          202: {
            type: 'object',
            properties: {
              execId: { type: 'string' },
              status: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as any;

      // TODO: Send tool execution request to tool runner via message queue
      const execId = `exec_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      return reply.status(202).send({
        execId,
        status: 'queued',
        message: 'Tool execution queued',
      });
    }
  );

  // Get tool execution result
  server.get(
    '/exec/:execId',
    {
      onRequest: [server.authenticate],
    },
    async (request, reply) => {
      const { execId } = request.params as { execId: string };

      // TODO: Fetch execution result from database
      return reply.send({
        execId,
        status: 'running',
        tool: 'shell',
      });
    }
  );

  // Stream tool execution output (SSE)
  server.get(
    '/exec/:execId/stream',
    {
      onRequest: [server.authenticate],
    },
    async (request, reply) => {
      const { execId } = request.params as { execId: string };

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      reply.raw.write(`data: ${JSON.stringify({ type: 'connected', execId })}\n\n`);

      // TODO: Subscribe to tool output from message bus
      const interval = setInterval(() => {
        reply.raw.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
      }, 10000);

      request.raw.on('close', () => {
        clearInterval(interval);
        reply.raw.end();
      });
    }
  );

  // Cancel tool execution
  server.delete(
    '/exec/:execId',
    {
      onRequest: [server.authenticate, server.authorize(['admin', 'operator', 'developer'])],
    },
    async (request, reply) => {
      const { execId } = request.params as { execId: string };

      // TODO: Send cancellation request to tool runner
      return reply.send({
        execId,
        status: 'canceled',
        message: 'Tool execution cancellation requested',
      });
    }
  );

  // List available tools
  server.get(
    '/',
    {
      onRequest: [server.authenticate],
    },
    async (request, reply) => {
      // TODO: Fetch tools from tool registry
      return reply.send({
        tools: [
          {
            name: 'shell',
            kind: 'shell',
            description: 'Execute shell commands',
            version: '1.0.0',
          },
        ],
      });
    }
  );
};

export { toolRoutes };
