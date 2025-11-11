import EventEmitter from 'eventemitter3';
import { nanoid } from 'nanoid';
import { createLogger } from '@phalanx/shared';
import type { MCPTransport } from '../types/transport';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  MCPServerInfo,
  MCPToolDefinition,
  MCPToolCallRequest,
  MCPToolCallResponse,
  MCPPromptDefinition,
  MCPPromptResponse,
  MCPResourceDefinition,
} from '../types/protocol';
import { MCPMethods, MCPError, MCPErrorCodes } from '../types/protocol';

const logger = createLogger({ name: 'mcp-client' });

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
}

export interface MCPClientOptions {
  transport: MCPTransport;
  requestTimeout?: number;
  clientInfo?: {
    name: string;
    version: string;
  };
}

export class MCPClient extends EventEmitter {
  private transport: MCPTransport;
  private pendingRequests = new Map<string | number, PendingRequest>();
  private requestTimeout: number;
  private clientInfo: { name: string; version: string };
  private serverInfo?: MCPServerInfo;
  private initialized = false;

  constructor(options: MCPClientOptions) {
    super();
    this.transport = options.transport;
    this.requestTimeout = options.requestTimeout || 30000;
    this.clientInfo = options.clientInfo || {
      name: 'phalanx-mcp-client',
      version: '0.1.0',
    };

    this.transport.onMessage((message) => this.handleMessage(message));
    this.transport.onError((error) => this.emit('error', error));
    this.transport.onClose(() => this.handleClose());
  }

  /**
   * Connect and initialize the MCP session
   */
  async connect(): Promise<MCPServerInfo> {
    logger.info('Connecting to MCP server');

    await this.transport.connect();

    // Send initialize request
    const serverInfo = await this.request<MCPServerInfo>(MCPMethods.INITIALIZE, {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: true,
        prompts: true,
        resources: true,
      },
      clientInfo: this.clientInfo,
    });

    this.serverInfo = serverInfo;
    this.initialized = true;

    // Send initialized notification
    await this.notify(MCPMethods.INITIALIZED, {});

    logger.info({ serverInfo }, 'MCP session initialized');
    this.emit('initialized', serverInfo);

    return serverInfo;
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    logger.info('Disconnecting from MCP server');

    try {
      await this.notify(MCPMethods.SHUTDOWN, {});
    } catch (error) {
      logger.warn({ error }, 'Error sending shutdown notification');
    }

    await this.transport.disconnect();
    this.initialized = false;
  }

  /**
   * List available tools
   */
  async listTools(): Promise<MCPToolDefinition[]> {
    this.ensureInitialized();

    logger.debug('Listing tools');

    const response = await this.request<{ tools: MCPToolDefinition[] }>(
      MCPMethods.LIST_TOOLS,
      {}
    );

    return response.tools || [];
  }

  /**
   * Call a tool
   */
  async callTool(request: MCPToolCallRequest): Promise<MCPToolCallResponse> {
    this.ensureInitialized();

    logger.info({ toolName: request.name }, 'Calling tool');

    const response = await this.request<MCPToolCallResponse>(MCPMethods.CALL_TOOL, {
      name: request.name,
      arguments: request.arguments,
    });

    return response;
  }

  /**
   * List available prompts
   */
  async listPrompts(): Promise<MCPPromptDefinition[]> {
    this.ensureInitialized();

    logger.debug('Listing prompts');

    const response = await this.request<{ prompts: MCPPromptDefinition[] }>(
      MCPMethods.LIST_PROMPTS,
      {}
    );

    return response.prompts || [];
  }

  /**
   * Get a prompt
   */
  async getPrompt(name: string, args?: Record<string, string>): Promise<MCPPromptResponse> {
    this.ensureInitialized();

    logger.info({ promptName: name }, 'Getting prompt');

    const response = await this.request<MCPPromptResponse>(MCPMethods.GET_PROMPT, {
      name,
      arguments: args,
    });

    return response;
  }

  /**
   * List available resources
   */
  async listResources(): Promise<MCPResourceDefinition[]> {
    this.ensureInitialized();

    logger.debug('Listing resources');

    const response = await this.request<{ resources: MCPResourceDefinition[] }>(
      MCPMethods.LIST_RESOURCES,
      {}
    );

    return response.resources || [];
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<{ contents: Array<{ uri: string; mimeType?: string; text?: string }> }> {
    this.ensureInitialized();

    logger.info({ uri }, 'Reading resource');

    const response = await this.request<{ contents: Array<{ uri: string; mimeType?: string; text?: string }> }>(
      MCPMethods.READ_RESOURCE,
      { uri }
    );

    return response;
  }

  /**
   * Ping the server
   */
  async ping(): Promise<void> {
    this.ensureInitialized();
    await this.request(MCPMethods.PING, {});
  }

  /**
   * Get server info
   */
  getServerInfo(): MCPServerInfo | undefined {
    return this.serverInfo;
  }

  /**
   * Check if client is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Send a JSON-RPC request and wait for response
   */
  private async request<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
    const id = nanoid();

    const message: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new MCPError(MCPErrorCodes.INTERNAL_ERROR, `Request timeout after ${this.requestTimeout}ms`));
      }, this.requestTimeout);

      this.pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result as T);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timeout,
      });

      this.transport.send(message).catch((error) => {
        this.pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Send a JSON-RPC notification (no response expected)
   */
  private async notify(method: string, params: Record<string, unknown>): Promise<void> {
    const message: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    await this.transport.send(message);
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: JsonRpcResponse | JsonRpcNotification): void {
    // Check if it's a response
    if ('id' in message) {
      const response = message as JsonRpcResponse;
      const pending = this.pendingRequests.get(response.id);

      if (!pending) {
        logger.warn({ messageId: response.id }, 'Received response for unknown request');
        return;
      }

      this.pendingRequests.delete(response.id);

      if (response.error) {
        pending.reject(
          new MCPError(response.error.code, response.error.message, response.error.data)
        );
      } else {
        pending.resolve(response.result);
      }
    } else {
      // It's a notification
      const notification = message as JsonRpcNotification;
      logger.debug({ method: notification.method }, 'Received notification');
      this.emit('notification', notification);

      // Handle specific notifications
      if (notification.method === MCPMethods.TOOLS_CHANGED) {
        this.emit('tools_changed');
      } else if (notification.method === MCPMethods.PROMPTS_CHANGED) {
        this.emit('prompts_changed');
      } else if (notification.method === MCPMethods.RESOURCES_CHANGED) {
        this.emit('resources_changed');
      }
    }
  }

  /**
   * Handle transport close
   */
  private handleClose(): void {
    logger.info('Transport closed');
    this.initialized = false;

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      pending.reject(new MCPError(MCPErrorCodes.INTERNAL_ERROR, 'Connection closed'));
    }
    this.pendingRequests.clear();

    this.emit('closed');
  }

  /**
   * Ensure client is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new MCPError(MCPErrorCodes.SERVER_ERROR, 'Client not initialized');
    }
  }
}
