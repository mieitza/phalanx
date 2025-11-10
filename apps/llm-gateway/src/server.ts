import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifySensible from '@fastify/sensible';
import { createLogger } from '@phalanx/shared';
import { ProviderRegistry } from './providers/registry';
import { completionRoutes } from './routes/completions';
import { modelRoutes } from './routes/models';

const logger = createLogger({ name: 'llm-gateway' });

export async function createServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: logger as any,
    requestIdLogLabel: 'requestId',
  });

  await server.register(fastifyCors);
  await server.register(fastifySensible);

  // Initialize provider registry
  const registry = new ProviderRegistry();
  await registry.initialize();

  server.decorate('providerRegistry', registry);

  // Routes
  await server.register(completionRoutes, { prefix: '/api/v1' });
  await server.register(modelRoutes, { prefix: '/api/v1' });

  // Health check
  server.get('/health', async () => ({ status: 'ok' }));

  return server;
}

declare module 'fastify' {
  interface FastifyInstance {
    providerRegistry: ProviderRegistry;
  }
}
