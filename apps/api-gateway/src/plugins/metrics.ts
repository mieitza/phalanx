import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

declare module 'fastify' {
  interface FastifyInstance {
    metrics: {
      registry: Registry;
      httpRequestsTotal: Counter;
      httpRequestDuration: Histogram;
      httpRequestsInFlight: Gauge;
    };
  }
}

const metricsPlugin: FastifyPluginAsync = async (server) => {
  const registry = new Registry();

  // Collect default metrics (CPU, memory, etc.)
  collectDefaultMetrics({ register: registry, prefix: 'phalanx_' });

  // Custom metrics
  const httpRequestsTotal = new Counter({
    name: 'phalanx_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry],
  });

  const httpRequestDuration = new Histogram({
    name: 'phalanx_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
    registers: [registry],
  });

  const httpRequestsInFlight = new Gauge({
    name: 'phalanx_http_requests_in_flight',
    help: 'Number of HTTP requests currently being processed',
    registers: [registry],
  });

  // Hook to track metrics
  server.addHook('onRequest', async (request, reply) => {
    httpRequestsInFlight.inc();
    request.raw.startTime = Date.now();
  });

  server.addHook('onResponse', async (request, reply) => {
    httpRequestsInFlight.dec();

    const duration = (Date.now() - (request.raw.startTime || Date.now())) / 1000;
    const route = request.routerPath || request.url;
    const labels = {
      method: request.method,
      route,
      status_code: reply.statusCode.toString(),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, duration);
  });

  // Expose metrics endpoint
  server.get('/metrics', async (request, reply) => {
    reply.type('text/plain');
    return registry.metrics();
  });

  // Decorate Fastify instance
  server.decorate('metrics', {
    registry,
    httpRequestsTotal,
    httpRequestDuration,
    httpRequestsInFlight,
  });
};

export default fp(metricsPlugin, {
  name: 'metrics',
});
