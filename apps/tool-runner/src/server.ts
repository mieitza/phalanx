import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifySensible from '@fastify/sensible';
import { createLogger } from '@phalanx/shared';
import { ExecutionManager } from './execution/manager';
import { PolicyEngine } from './policy/engine';
import { executionRoutes } from './routes/execution';

const logger = createLogger({ name: 'tool-runner' });

export async function createServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: logger as any,
    requestIdLogLabel: 'requestId',
  });

  await server.register(fastifyCors);
  await server.register(fastifySensible);

  // Initialize managers
  const policyEngine = new PolicyEngine();
  const executionManager = new ExecutionManager(policyEngine);

  server.decorate('executionManager', executionManager);
  server.decorate('policyEngine', policyEngine);

  // Routes
  await server.register(executionRoutes, { prefix: '/api/v1' });

  // Health check
  server.get('/health', async () => ({ status: 'ok' }));

  return server;
}

declare module 'fastify' {
  interface FastifyInstance {
    executionManager: ExecutionManager;
    policyEngine: PolicyEngine;
  }
}
