import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createServer } from './server';

describe('Tool Runner Server', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await createServer();
  });

  afterEach(async () => {
    await server.close();
  });

  describe('Health Check', () => {
    it('should respond to health check', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
    });
  });

  describe('Execution', () => {
    it('should execute simple shell command', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/exec',
        payload: {
          tool: 'shell',
          args: {
            cmd: 'echo "Hello World"',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('success');
      expect(body.exitCode).toBe(0);
      expect(body.llmContent).toContain('Hello World');
    });

    it('should handle command failures', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/exec',
        payload: {
          tool: 'shell',
          args: {
            cmd: 'exit 1',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('error');
      expect(body.exitCode).toBe(1);
    });

    it('should require confirmation for dangerous commands', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/exec',
        payload: {
          tool: 'shell',
          args: {
            cmd: 'rm -rf /tmp/test',
          },
        },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('awaiting_confirmation');
    });

    it('should deny dangerous root deletion', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/exec',
        payload: {
          tool: 'shell',
          args: {
            cmd: 'rm -rf /',
          },
        },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('Policy Engine', () => {
    it('should list policy rules', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/v1/policy/rules',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.rules).toBeDefined();
      expect(Array.isArray(body.rules)).toBe(true);
      expect(body.rules.length).toBeGreaterThan(0);
    });
  });
});
