import { FastifyPluginAsync } from 'fastify';
import Redis from 'ioredis';

const healthRoutes: FastifyPluginAsync = async (server) => {
  // Liveness probe - basic server health
  server.get('/health/live', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Readiness probe - check dependencies
  server.get('/health/ready', async (request, reply) => {
    const checks: Record<string, any> = {
      server: 'ok',
    };

    // Check Redis if configured
    if (process.env.REDIS_URL) {
      try {
        const redis = new Redis(process.env.REDIS_URL);
        await redis.ping();
        checks.redis = 'ok';
        await redis.quit();
      } catch (err) {
        checks.redis = { status: 'error', error: (err as Error).message };
        return reply.status(503).send({
          status: 'not_ready',
          checks,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return {
      status: 'ready',
      checks,
      timestamp: new Date().toISOString(),
    };
  });

  // Startup probe
  server.get('/health/startup', async (request, reply) => {
    return {
      status: 'started',
      version: process.env.npm_package_version || '0.1.0',
      timestamp: new Date().toISOString(),
    };
  });
};

export { healthRoutes };
