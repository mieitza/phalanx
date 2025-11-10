import { FastifyPluginAsync } from 'fastify';
import { CompletionRequestSchema } from '@phalanx/schemas';
import { createLogger } from '@phalanx/shared';

const logger = createLogger({ name: 'completions-route' });

export const completionRoutes: FastifyPluginAsync = async (server) => {
  // Non-streaming completion
  server.post(
    '/completions',
    {
      schema: {
        body: CompletionRequestSchema,
      },
    },
    async (request, reply) => {
      const body = request.body as any;
      const startTime = Date.now();

      try {
        const provider = server.providerRegistry.getProvider(body.model);

        logger.info(
          {
            model: body.model,
            provider: provider.name,
            messageCount: body.messages.length,
          },
          'Processing completion request'
        );

        const response = await provider.complete(body);

        const duration = Date.now() - startTime;
        logger.info(
          {
            model: body.model,
            provider: provider.name,
            duration,
            tokens: response.usage.totalTokens,
          },
          'Completion completed'
        );

        return response;
      } catch (error: any) {
        logger.error({ error, model: body.model }, 'Completion failed');
        throw error;
      }
    }
  );

  // Streaming completion (SSE)
  server.post('/stream', async (request, reply) => {
    const body = request.body as any;
    const startTime = Date.now();

    try {
      const provider = server.providerRegistry.getProvider(body.model);

      logger.info(
        {
          model: body.model,
          provider: provider.name,
          messageCount: body.messages.length,
        },
        'Processing streaming completion request'
      );

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      let tokenCount = 0;

      for await (const chunk of provider.stream(body)) {
        if (chunk.type === 'token') {
          tokenCount++;
        }

        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      const duration = Date.now() - startTime;
      logger.info(
        {
          model: body.model,
          provider: provider.name,
          duration,
          tokens: tokenCount,
        },
        'Streaming completion completed'
      );

      reply.raw.end();
    } catch (error: any) {
      logger.error({ error, model: body.model }, 'Streaming completion failed');
      reply.raw.write(
        `data: ${JSON.stringify({ type: 'error', error: { message: error.message } })}\n\n`
      );
      reply.raw.end();
    }
  });
};
