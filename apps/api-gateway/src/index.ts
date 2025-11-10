import Fastify from 'fastify';
import { createServer } from './server';
import { createLogger } from '@phalanx/shared';
import { initTelemetry } from './telemetry';

const logger = createLogger({ name: 'api-gateway' });

async function start() {
  try {
    // Initialize OpenTelemetry
    initTelemetry();

    const server = await createServer();

    const port = parseInt(process.env.PORT || '3001', 10);
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });

    logger.info({ port, host }, 'API Gateway started');

    // Graceful shutdown
    const signals = ['SIGINT', 'SIGTERM'];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, closing server gracefully`);
        await server.close();
        process.exit(0);
      });
    });
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }
}

start();
