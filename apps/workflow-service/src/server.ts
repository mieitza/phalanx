import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifySensible from '@fastify/sensible';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { createLogger } from '@phalanx/shared';
import { WorkflowManager } from './services/workflow-manager';
import { workflowRoutes } from './routes/workflows';
import { runRoutes } from './routes/runs';

const logger = createLogger({ name: 'workflow-service' });

export async function createServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: logger as any,
    requestIdLogLabel: 'requestId',
  });

  // Set up Zod schema validation
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  await server.register(fastifyCors);
  await server.register(fastifySensible);

  // Initialize workflow manager
  const workflowManager = new WorkflowManager();
  server.decorate('workflowManager', workflowManager);

  // Routes
  await server.register(workflowRoutes, { prefix: '/api/v1/workflows' });
  await server.register(runRoutes, { prefix: '/api/v1/runs' });

  // Health check
  server.get('/health', async () => ({ status: 'ok' }));

  return server;
}

declare module 'fastify' {
  interface FastifyInstance {
    workflowManager: WorkflowManager;
  }
}
