import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createLogger } from '@phalanx/shared';
import type { MCPServerManager } from '../services/server-manager';

const logger = createLogger({ name: 'mcp-servers-route' });

const TransportConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stdio'),
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
  }),
  z.object({
    type: z.literal('http'),
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
  }),
  z.object({
    type: z.literal('websocket'),
    url: z.string().url(),
    protocols: z.array(z.string()).optional(),
    headers: z.record(z.string()).optional(),
  }),
]);

const RegisterServerSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  transport: TransportConfigSchema,
  autoConnect: z.boolean().optional(),
});

const CallToolSchema = z.object({
  name: z.string().min(1),
  arguments: z.record(z.unknown()),
});

export const serverRoutes: FastifyPluginAsync = async (server) => {
  const serverManager: MCPServerManager = (server as any).serverManager;

  // Register a new MCP server
  server.post<{
    Body: z.infer<typeof RegisterServerSchema>;
    Headers: { 'x-tenant-id': string };
  }>(
    '/',
    {
      schema: {
        body: RegisterServerSchema,
      },
    },
    async (request, reply) => {
      const tenantId = request.headers['x-tenant-id'];

      if (!tenantId) {
        return reply.status(400).send({
          error: 'Missing x-tenant-id header',
        });
      }

      logger.info({ tenantId, name: request.body.name }, 'Registering MCP server');

      try {
        const registered = await serverManager.registerServer({
          ...request.body,
          tenantId,
        });

        return registered;
      } catch (error: any) {
        logger.error({ error }, 'Failed to register server');
        return reply.status(500).send({
          error: 'Failed to register server',
          message: error.message,
        });
      }
    }
  );

  // List all registered servers
  server.get<{
    Headers: { 'x-tenant-id': string };
  }>('/', async (request, reply) => {
    const tenantId = request.headers['x-tenant-id'];

    if (!tenantId) {
      return reply.status(400).send({
        error: 'Missing x-tenant-id header',
      });
    }

    const servers = serverManager.listServers(tenantId);
    return { servers };
  });

  // Get server by ID
  server.get<{
    Params: { serverId: string };
  }>('/:serverId', async (request, reply) => {
    const { serverId } = request.params;

    const server = serverManager.getServer(serverId);

    if (!server) {
      return reply.status(404).send({
        error: 'Server not found',
      });
    }

    return server;
  });

  // Connect to server
  server.post<{
    Params: { serverId: string };
  }>('/:serverId/connect', async (request, reply) => {
    const { serverId } = request.params;

    logger.info({ serverId }, 'Connecting to server');

    try {
      await serverManager.connectServer(serverId);
      return { status: 'connected' };
    } catch (error: any) {
      logger.error({ error, serverId }, 'Failed to connect to server');
      return reply.status(500).send({
        error: 'Failed to connect to server',
        message: error.message,
      });
    }
  });

  // Disconnect from server
  server.post<{
    Params: { serverId: string };
  }>('/:serverId/disconnect', async (request, reply) => {
    const { serverId } = request.params;

    logger.info({ serverId }, 'Disconnecting from server');

    try {
      await serverManager.disconnectServer(serverId);
      return { status: 'disconnected' };
    } catch (error: any) {
      logger.error({ error, serverId }, 'Failed to disconnect from server');
      return reply.status(500).send({
        error: 'Failed to disconnect from server',
        message: error.message,
      });
    }
  });

  // Unregister server
  server.delete<{
    Params: { serverId: string };
  }>('/:serverId', async (request, reply) => {
    const { serverId } = request.params;

    logger.info({ serverId }, 'Unregistering server');

    try {
      await serverManager.unregisterServer(serverId);
      return { status: 'unregistered' };
    } catch (error: any) {
      logger.error({ error, serverId }, 'Failed to unregister server');
      return reply.status(500).send({
        error: 'Failed to unregister server',
        message: error.message,
      });
    }
  });

  // List tools from specific server
  server.get<{
    Params: { serverId: string };
  }>('/:serverId/tools', async (request, reply) => {
    const { serverId } = request.params;

    const server = serverManager.getServer(serverId);

    if (!server) {
      return reply.status(404).send({
        error: 'Server not found',
      });
    }

    if (server.status !== 'connected') {
      return reply.status(400).send({
        error: 'Server not connected',
      });
    }

    return {
      tools: server.tools || [],
    };
  });

  // Call tool on specific server
  server.post<{
    Params: { serverId: string };
    Body: z.infer<typeof CallToolSchema>;
  }>(
    '/:serverId/tools/call',
    {
      schema: {
        body: CallToolSchema,
      },
    },
    async (request, reply) => {
      const { serverId } = request.params;
      const { name, arguments: args } = request.body;

      logger.info({ serverId, toolName: name }, 'Calling tool on server');

      try {
        const response = await serverManager.callTool(serverId, {
          name,
          arguments: args,
        });

        return response;
      } catch (error: any) {
        logger.error({ error, serverId, toolName: name }, 'Failed to call tool');
        return reply.status(500).send({
          error: 'Failed to call tool',
          message: error.message,
        });
      }
    }
  );
};
