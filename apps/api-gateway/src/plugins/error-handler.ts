import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { PhalanxError } from '@phalanx/shared';

const errorHandlerPlugin: FastifyPluginAsync = async (server) => {
  server.setErrorHandler((error, request, reply) => {
    const { log } = request;

    if (error instanceof PhalanxError) {
      log.warn({ err: error, metadata: error.metadata }, error.message);
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
          metadata: error.metadata,
        },
      });
    }

    // Handle Fastify validation errors
    if (error.validation) {
      log.warn({ err: error }, 'Validation error');
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          statusCode: 400,
          details: error.validation,
        },
      });
    }

    // Handle rate limit errors
    if (error.statusCode === 429) {
      log.warn({ err: error }, 'Rate limit exceeded');
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          statusCode: 429,
        },
      });
    }

    // Default error handling
    log.error({ err: error }, 'Unhandled error');
    return reply.status(error.statusCode || 500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: process.env.NODE_ENV === 'production' ? 'An error occurred' : error.message,
        statusCode: error.statusCode || 500,
      },
    });
  });
};

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
});
