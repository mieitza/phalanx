import Fastify from 'fastify';
import cors from '@fastify/cors';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { createLogger } from '@phalanx/shared';
import { MCPServerManager } from './services/server-manager';
import { serverRoutes } from './routes/servers';
import { toolRoutes } from './routes/tools';

const logger = createLogger({ name: 'mcp-service' });

export async function createServer() {
  const server = Fastify({
    logger: false, // Use our custom logger
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Register CORS
  await server.register(cors, {
    origin: true,
    credentials: true,
  });

  // Create and attach server manager
  const serverManager = new MCPServerManager();
  server.decorate('serverManager', serverManager);

  // Health check
  server.get('/health', async () => {
    return {
      status: 'ok',
      service: 'mcp-service',
      timestamp: new Date().toISOString(),
    };
  });

  // Register routes
  await server.register(serverRoutes, { prefix: '/api/v1/servers' });
  await server.register(toolRoutes, { prefix: '/api/v1/tools' });

  return server;
}
