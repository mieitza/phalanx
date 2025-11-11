// Protocol client
export { MCPClient } from './protocol/client';
export type { MCPClientOptions } from './protocol/client';

// Transports
export { StdioTransport } from './transport/stdio';
export type { StdioTransportOptions } from './transport/stdio';
export { HttpTransport } from './transport/http';
export type { HttpTransportOptions } from './transport/http';
export { WebSocketTransport } from './transport/websocket';
export type { WebSocketTransportOptions } from './transport/websocket';

// Types
export type {
  MCPTransport,
  TransportConfig,
  StdioTransportConfig,
  HttpTransportConfig,
  WebSocketTransportConfig,
} from './types/transport';

export type {
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
} from './types/protocol';

export { MCPMethods, MCPErrorCodes, MCPError } from './types/protocol';

// Factory function for creating transport from config
import type { MCPTransport, TransportConfig } from './types/transport';
import { StdioTransport } from './transport/stdio';
import { HttpTransport } from './transport/http';
import { WebSocketTransport } from './transport/websocket';

export function createTransport(config: TransportConfig): MCPTransport {
  switch (config.type) {
    case 'stdio':
      return new StdioTransport({
        command: config.command,
        args: config.args,
        env: config.env,
      });
    case 'http':
      return new HttpTransport({
        url: config.url,
        headers: config.headers,
      });
    case 'websocket':
      return new WebSocketTransport({
        url: config.url,
        protocols: config.protocols,
        headers: config.headers,
      });
    default:
      throw new Error(`Unknown transport type: ${(config as any).type}`);
  }
}
