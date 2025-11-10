import { FastifyPluginAsync } from 'fastify';
import { ToolExecutionRequestSchema } from '@phalanx/schemas';
import { createLogger } from '@phalanx/shared';

const logger = createLogger({ name: 'execution-routes' });

export const executionRoutes: FastifyPluginAsync = async (server) => {
  // Execute tool
  server.post(
    '/exec',
    {
      schema: {
        body: ToolExecutionRequestSchema,
      },
    },
    async (request, reply) => {
      const body = request.body as any;

      try {
        const result = await server.executionManager.execute(
          {
            command: body.args.cmd || body.args.command,
            workingDir: body.args.workingDir || body.args.working_dir,
            env: body.args.env,
            timeout: body.policy?.timeout,
          },
          {
            sandbox: process.env.SANDBOX_EXECUTOR === 'docker',
            policy: body.policy,
          }
        );

        if (result.result) {
          // Execution completed immediately
          return result.result;
        } else {
          // Awaiting confirmation
          return reply.status(202).send({
            execId: result.id,
            status: 'awaiting_confirmation',
            message: 'Execution requires user confirmation',
          });
        }
      } catch (err: any) {
        logger.error({ err, tool: body.tool }, 'Execution failed');
        throw err;
      }
    }
  );

  // Get execution status
  server.get('/exec/:execId', async (request, reply) => {
    const { execId } = request.params as { execId: string };

    const state = server.executionManager.getState(execId);
    if (!state) {
      return reply.status(404).send({ error: 'Execution not found' });
    }

    return {
      id: state.id,
      status: state.status,
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      exitCode: state.exitCode,
    };
  });

  // Stream execution output (SSE)
  server.get('/exec/:execId/stream', async (request, reply) => {
    const { execId } = request.params as { execId: string };

    const executor = server.executionManager.getExecution(execId);
    if (!executor) {
      return reply.status(404).send({ error: 'Execution not found' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', execId })}\n\n`);

    // Stream events from executor
    const streamHandler = (event: any) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    executor.on('stream', streamHandler);

    // Handle client disconnect
    request.raw.on('close', () => {
      executor.off('stream', streamHandler);
      reply.raw.end();
    });

    // Send final state when execution completes
    const state = executor.getState();
    if (state.status === 'completed' || state.status === 'failed' || state.status === 'canceled') {
      reply.raw.write(
        `data: ${JSON.stringify({ type: 'done', status: state.status, exitCode: state.exitCode })}\n\n`
      );
      reply.raw.end();
    }
  });

  // Cancel execution
  server.delete('/exec/:execId', async (request, reply) => {
    const { execId } = request.params as { execId: string };

    try {
      await server.executionManager.cancel(execId);
      return {
        execId,
        status: 'canceled',
        message: 'Execution canceled',
      };
    } catch (err: any) {
      logger.error({ err, execId }, 'Failed to cancel execution');
      throw err;
    }
  });

  // List policy rules
  server.get('/policy/rules', async (request, reply) => {
    const rules = server.policyEngine.getRules();
    return { rules };
  });

  // Add policy rule
  server.post('/policy/rules', async (request, reply) => {
    const rule = request.body as any;
    server.policyEngine.addRule(rule);
    return { success: true, rule };
  });
};
