import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer } from './server';

describe('API Gateway Server', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await createServer();
  });

  afterEach(async () => {
    await server.close();
  });

  describe('Health Routes', () => {
    it('should respond to liveness probe', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health/live',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });

    it('should respond to readiness probe', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health/ready',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ready');
      expect(body.checks).toBeDefined();
    });

    it('should respond to startup probe', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health/startup',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('started');
      expect(body.version).toBeDefined();
    });
  });

  describe('Metrics', () => {
    it('should expose Prometheus metrics', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.body).toContain('phalanx_');
    });
  });

  describe('Authentication', () => {
    it('should reject requests without auth token', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/workflows/run',
        payload: {
          workflowId: 'test',
          inputs: {},
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should reject requests with invalid token', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/workflows/run',
        headers: {
          authorization: 'Bearer invalid-token',
        },
        payload: {
          workflowId: 'test',
          inputs: {},
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors', async () => {
      // Generate a valid token for testing
      const token = server.jwt.sign({
        sub: 'test-user',
        email: 'test@example.com',
        roles: ['developer'],
        tenant_id: 'test-tenant',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/workflows/run',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          // Missing required fields
          inputs: {},
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
