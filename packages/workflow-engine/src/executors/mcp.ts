import { NodeExecutor } from './base';
import type { WorkflowNode } from '@phalanx/schemas';
import type { WorkflowContext, NodeExecutionResult } from '../types';
import { createLogger } from '@phalanx/shared';

const logger = createLogger({ name: 'mcp-node-executor' });

export interface MCPNodeConfig {
  toolName: string;
  serverId?: string; // Optional - will auto-discover if not provided
  inputs: Record<string, unknown>;
  mcpServiceUrl?: string; // URL of MCP service, defaults to http://localhost:3005
}

export class MCPNodeExecutor extends NodeExecutor {
  readonly type = 'mcp';

  async execute(node: WorkflowNode, context: WorkflowContext): Promise<NodeExecutionResult> {
    const config = node.config as unknown as MCPNodeConfig;

    logger.info(
      { nodeId: node.id, toolName: config.toolName, serverId: config.serverId },
      'Executing MCP node'
    );

    // Resolve inputs
    const resolvedInputs = this.resolveInputs(config.inputs, context);

    // Get MCP service URL
    const mcpServiceUrl = config.mcpServiceUrl || process.env.MCP_SERVICE_URL || 'http://localhost:3005';

    try {
      // Call MCP tool via MCP service
      const response = await fetch(`${mcpServiceUrl}/api/v1/tools/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': context.tenantId,
        },
        body: JSON.stringify({
          name: config.toolName,
          arguments: resolvedInputs,
          serverId: config.serverId,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`MCP tool call failed: ${((error as any).error || ((error as Error).message)) || response.statusText}`);
      }

      const result = await response.json();

      logger.info({ nodeId: node.id, toolName: config.toolName }, 'MCP tool call successful');

      return {
        output: result,
        metadata: {
          toolName: config.toolName,
          serverId: config.serverId,
        },
      };
    } catch (error) {
      logger.error({ nodeId: node.id, error, toolName: config.toolName }, 'MCP tool call failed');
      throw error;
    }
  }
}
