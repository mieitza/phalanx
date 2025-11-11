import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createLogger } from '@phalanx/shared';
import type { MCPServerManager } from '../services/server-manager';

const logger = createLogger({ name: 'mcp-tools-route' });

const CallToolSchema = z.object({
  name: z.string().min(1),
  arguments: z.record(z.unknown()),
  serverId: z.string().optional(), // Optional - will auto-discover if not provided
});

export const toolRoutes: FastifyPluginAsync = async (server) => {
  const serverManager: MCPServerManager = (server as any).serverManager;

  // List all tools across all servers
  server.get<{
    Headers: { 'x-tenant-id': string };
  }>('/', async (request, reply) => {
    const tenantId = request.headers['x-tenant-id'];

    if (!tenantId) {
      return reply.status(400).send({
        error: 'Missing x-tenant-id header',
      });
    }

    const tools = serverManager.listAllTools(tenantId);
    return { tools };
  });

  // Find tool by name
  server.get<{
    Params: { toolName: string };
    Headers: { 'x-tenant-id': string };
  }>('/:toolName', async (request, reply) => {
    const { toolName } = request.params;
    const tenantId = request.headers['x-tenant-id'];

    if (!tenantId) {
      return reply.status(400).send({
        error: 'Missing x-tenant-id header',
      });
    }

    const found = serverManager.findTool(toolName, tenantId);

    if (!found) {
      return reply.status(404).send({
        error: 'Tool not found',
      });
    }

    return {
      serverId: found.serverId,
      tool: found.tool,
    };
  });

  // Call tool with auto-discovery
  server.post<{
    Headers: { 'x-tenant-id': string };
  }>('/call', async (request, reply) => {
    const tenantId = request.headers['x-tenant-id'];

    if (!tenantId) {
      return reply.status(400).send({
        error: 'Missing x-tenant-id header',
      });
    }

    // Validate request body
    const result = CallToolSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: result.error.errors,
      });
    }

    const { name, arguments: args, serverId } = result.data;

    let targetServerId = serverId;

    // Auto-discover server if not provided
    if (!targetServerId) {
      const found = serverManager.findTool(name, tenantId);

      if (!found) {
        return reply.status(404).send({
          error: 'Tool not found',
        });
      }

      targetServerId = found.serverId;
    }

    logger.info({ serverId: targetServerId, toolName: name }, 'Calling tool');

    try {
      const response = await serverManager.callTool(targetServerId, {
        name,
        arguments: args,
      });

      return response;
    } catch (error: any) {
      logger.error({ error, serverId: targetServerId, toolName: name }, 'Failed to call tool');
      return reply.status(500).send({
        error: 'Failed to call tool',
        message: error.message,
      });
    }
  });
};
