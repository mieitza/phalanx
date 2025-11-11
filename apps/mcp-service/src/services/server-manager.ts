import { nanoid } from 'nanoid';
import { createLogger } from '@phalanx/shared';
import { createDatabase, DatabaseInstance } from '@phalanx/database';
import { eq } from 'drizzle-orm';
import {
  MCPClient,
  createTransport,
  type TransportConfig,
  type MCPServerInfo,
  type MCPToolDefinition,
  type MCPToolCallRequest,
  type MCPToolCallResponse,
} from '@phalanx/mcp-client';

const logger = createLogger({ name: 'mcp-server-manager' });

export interface MCPServerConfig {
  id?: string;
  name: string;
  description?: string;
  transport: TransportConfig;
  autoConnect?: boolean;
  tenantId: string;
}

export interface RegisteredServer {
  id: string;
  name: string;
  description?: string;
  transport: TransportConfig;
  tenantId: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  serverInfo?: MCPServerInfo;
  error?: string;
  connectedAt?: Date;
  tools?: MCPToolDefinition[];
}

export class MCPServerManager {
  private db: DatabaseInstance;
  private clients = new Map<string, MCPClient>();
  private servers = new Map<string, RegisteredServer>();

  constructor() {
    this.db = createDatabase();
    // Load servers from database on startup
    this.loadServers().catch((err) => {
      logger.error({ err }, 'Failed to load servers');
    });
  }

  /**
   * Register a new MCP server
   */
  async registerServer(config: MCPServerConfig): Promise<RegisteredServer> {
    const id = config.id || nanoid();

    logger.info({ id, name: config.name }, 'Registering MCP server');

    // Store in database
    await this.db.db.insert(this.db.schema.mcpServers).values({
      id,
      tenantId: config.tenantId,
      name: config.name,
      description: config.description,
      transport: JSON.stringify(config.transport),
      status: 'disconnected',
      createdAt: new Date(),
    });

    const server: RegisteredServer = {
      id,
      name: config.name,
      description: config.description,
      transport: config.transport,
      tenantId: config.tenantId,
      status: 'disconnected',
    };

    this.servers.set(id, server);

    // Auto-connect if requested
    if (config.autoConnect) {
      await this.connectServer(id);
    }

    return server;
  }

  /**
   * Connect to a registered server
   */
  async connectServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);

    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    if (server.status === 'connected') {
      logger.info({ serverId }, 'Server already connected');
      return;
    }

    logger.info({ serverId, name: server.name }, 'Connecting to MCP server');

    server.status = 'connecting';
    this.servers.set(serverId, server);
    await this.updateServerStatus(serverId, 'connecting');

    try {
      const transport = createTransport(server.transport);
      const client = new MCPClient({ transport });

      // Handle client events
      client.on('closed', () => {
        logger.warn({ serverId }, 'Server connection closed');
        this.handleDisconnect(serverId);
      });

      client.on('error', (error) => {
        logger.error({ serverId, error }, 'Server error');
        server.error = error.message;
        this.servers.set(serverId, server);
      });

      client.on('tools_changed', async () => {
        logger.info({ serverId }, 'Tools changed notification received');
        await this.refreshTools(serverId);
      });

      // Connect and initialize
      const serverInfo = await client.connect();

      // Discover tools
      const tools = await client.listTools();

      server.status = 'connected';
      server.serverInfo = serverInfo;
      server.connectedAt = new Date();
      server.tools = tools;
      server.error = undefined;

      this.clients.set(serverId, client);
      this.servers.set(serverId, server);

      await this.updateServerStatus(serverId, 'connected', serverInfo, tools);

      logger.info({ serverId, toolCount: tools.length }, 'Server connected successfully');
    } catch (error) {
      logger.error({ serverId, error }, 'Failed to connect to server');
      server.status = 'error';
      server.error = (error as Error).message;
      this.servers.set(serverId, server);
      await this.updateServerStatus(serverId, 'error', undefined, undefined, (error as Error).message);
      throw error;
    }
  }

  /**
   * Disconnect from a server
   */
  async disconnectServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);

    if (!client) {
      logger.warn({ serverId }, 'No client found for server');
      return;
    }

    logger.info({ serverId }, 'Disconnecting from server');

    await client.disconnect();
    this.clients.delete(serverId);

    const server = this.servers.get(serverId);
    if (server) {
      server.status = 'disconnected';
      server.connectedAt = undefined;
      this.servers.set(serverId, server);
      await this.updateServerStatus(serverId, 'disconnected');
    }
  }

  /**
   * Unregister a server
   */
  async unregisterServer(serverId: string): Promise<void> {
    logger.info({ serverId }, 'Unregistering server');

    // Disconnect if connected
    if (this.clients.has(serverId)) {
      await this.disconnectServer(serverId);
    }

    // Remove from database
    await this.db.db
      .delete(this.db.schema.mcpServers)
      .where(eq(this.db.schema.mcpServers.id, serverId));

    this.servers.delete(serverId);
  }

  /**
   * Get server by ID
   */
  getServer(serverId: string): RegisteredServer | undefined {
    return this.servers.get(serverId);
  }

  /**
   * List all registered servers for a tenant
   */
  listServers(tenantId?: string): RegisteredServer[] {
    const servers = Array.from(this.servers.values());
    return tenantId ? servers.filter((s) => s.tenantId === tenantId) : servers;
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(serverId: string, request: MCPToolCallRequest): Promise<MCPToolCallResponse> {
    const client = this.clients.get(serverId);

    if (!client) {
      throw new Error(`Server ${serverId} not connected`);
    }

    logger.info({ serverId, toolName: request.name }, 'Calling tool');

    return await client.callTool(request);
  }

  /**
   * Discover tool by name across all servers
   */
  findTool(toolName: string, tenantId?: string): { serverId: string; tool: MCPToolDefinition } | undefined {
    for (const [serverId, server] of this.servers.entries()) {
      if (tenantId && server.tenantId !== tenantId) {
        continue;
      }

      if (server.status !== 'connected' || !server.tools) {
        continue;
      }

      const tool = server.tools.find((t) => t.name === toolName);
      if (tool) {
        return { serverId, tool };
      }
    }

    return undefined;
  }

  /**
   * List all available tools across all servers
   */
  listAllTools(tenantId?: string): Array<{ serverId: string; serverName: string; tool: MCPToolDefinition }> {
    const allTools: Array<{ serverId: string; serverName: string; tool: MCPToolDefinition }> = [];

    for (const [serverId, server] of this.servers.entries()) {
      if (tenantId && server.tenantId !== tenantId) {
        continue;
      }

      if (server.status !== 'connected' || !server.tools) {
        continue;
      }

      for (const tool of server.tools) {
        allTools.push({
          serverId,
          serverName: server.name,
          tool,
        });
      }
    }

    return allTools;
  }

  /**
   * Refresh tools from a server
   */
  private async refreshTools(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    const server = this.servers.get(serverId);

    if (!client || !server) {
      return;
    }

    try {
      const tools = await client.listTools();
      server.tools = tools;
      this.servers.set(serverId, server);

      // Update database
      await this.db.db
        .update(this.db.schema.mcpServers)
        .set({
          tools: JSON.stringify(tools),
        })
        .where(eq(this.db.schema.mcpServers.id, serverId));

      logger.info({ serverId, toolCount: tools.length }, 'Tools refreshed');
    } catch (error) {
      logger.error({ serverId, error }, 'Failed to refresh tools');
    }
  }

  /**
   * Handle server disconnect
   */
  private handleDisconnect(serverId: string): void {
    this.clients.delete(serverId);

    const server = this.servers.get(serverId);
    if (server) {
      server.status = 'disconnected';
      server.connectedAt = undefined;
      this.servers.set(serverId, server);
      this.updateServerStatus(serverId, 'disconnected').catch((err) => {
        logger.error({ serverId, err }, 'Failed to update server status');
      });
    }
  }

  /**
   * Load servers from database
   */
  private async loadServers(): Promise<void> {
    logger.info('Loading MCP servers from database');

    const servers = await this.db.db.select().from(this.db.schema.mcpServers);

    for (const server of servers) {
      const registeredServer: RegisteredServer = {
        id: server.id,
        name: server.name,
        description: server.description || undefined,
        transport: JSON.parse(server.transport as string),
        tenantId: server.tenantId,
        status: 'disconnected',
        serverInfo: server.serverInfo ? JSON.parse(server.serverInfo as string) : undefined,
        tools: server.tools ? JSON.parse(server.tools as string) : undefined,
      };

      this.servers.set(server.id, registeredServer);

      // Auto-reconnect if was previously connected
      if (server.status === 'connected') {
        this.connectServer(server.id).catch((err) => {
          logger.error({ serverId: server.id, err }, 'Failed to auto-reconnect server');
        });
      }
    }

    logger.info({ count: servers.length }, 'Loaded MCP servers');
  }

  /**
   * Update server status in database
   */
  private async updateServerStatus(
    serverId: string,
    status: RegisteredServer['status'],
    serverInfo?: MCPServerInfo,
    tools?: MCPToolDefinition[],
    error?: string
  ): Promise<void> {
    await this.db.db
      .update(this.db.schema.mcpServers)
      .set({
        status,
        serverInfo: serverInfo ? JSON.stringify(serverInfo) : undefined,
        tools: tools ? JSON.stringify(tools) : undefined,
        error,
      })
      .where(eq(this.db.schema.mcpServers.id, serverId));
  }
}
