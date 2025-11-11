import Fastify, { FastifyInstance } from 'fastify';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifySensible from '@fastify/sensible';
import fastifyRateLimit from '@fastify/rate-limit';
import { createLogger } from '@phalanx/shared';
import { authPlugin } from './plugins/auth';
import { metricsPlugin } from './plugins/metrics';
import errorHandlerPlugin from './plugins/error-handler';
import { healthRoutes } from './routes/health';
import { workflowRoutes } from './routes/workflows';
import { toolRoutes } from './routes/tools';
import { llmRoutes } from './routes/llm';
import { mcpRoutes } from './routes/mcp';

const logger = createLogger({ name: 'api-gateway' });

export async function createServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: logger as any,
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
    trustProxy: true,
  });

  // Security plugins
  await server.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  await server.register(fastifyCors, {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Rate limiting
  await server.register(fastifyRateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
    redis: process.env.REDIS_URL ? { url: process.env.REDIS_URL } : undefined,
  });

  // Utility plugins
  await server.register(fastifySensible);

  // Custom plugins
  await server.register(errorHandlerPlugin);
  await server.register(metricsPlugin);
  await server.register(authPlugin);

  // Routes
  await server.register(healthRoutes);
  await server.register(workflowRoutes, { prefix: '/api/v1/workflows' });
  await server.register(toolRoutes, { prefix: '/api/v1/tools' });
  await server.register(llmRoutes, { prefix: '/api/v1/llm' });
  await server.register(mcpRoutes, { prefix: '/api/v1/mcp' });

  return server;
}
