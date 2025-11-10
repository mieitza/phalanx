import { FastifyPluginAsync } from 'fastify';
import { CompletionRequestSchema, CompletionResponseSchema } from '@phalanx/schemas';

const llmRoutes: FastifyPluginAsync = async (server) => {
  // LLM completion (non-streaming)
  server.post(
    '/completions',
    {
      onRequest: [server.authenticate, server.authorize(['admin', 'operator', 'developer'])],
      schema: {
        body: CompletionRequestSchema,
        response: {
          200: CompletionResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as any;

      // TODO: Forward request to LLM gateway
      return reply.send({
        id: `cmpl_${Date.now()}`,
        model: body.model,
        content: 'This is a placeholder response',
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      });
    }
  );

  // LLM completion (streaming via SSE)
  server.post(
    '/stream',
    {
      onRequest: [server.authenticate, server.authorize(['admin', 'operator', 'developer'])],
    },
    async (request, reply) => {
      const body = request.body as any;

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      // TODO: Forward request to LLM gateway and stream response
      reply.raw.write(`data: ${JSON.stringify({ type: 'start', model: body.model })}\n\n`);

      // Simulate streaming tokens
      const tokens = ['This ', 'is ', 'a ', 'streaming ', 'response'];
      for (const token of tokens) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        reply.raw.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
      }

      reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      reply.raw.end();
    }
  );

  // List available models
  server.get(
    '/models',
    {
      onRequest: [server.authenticate],
    },
    async (request, reply) => {
      // TODO: Fetch models from LLM gateway
      return reply.send({
        models: [
          {
            id: 'ollama/llama3.1:8b',
            provider: 'ollama',
            name: 'Llama 3.1 8B',
            contextWindow: 8192,
          },
        ],
      });
    }
  );
};

export { llmRoutes };
