import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from './protocol';

/**
 * Transport layer interface for MCP communication
 */
export interface MCPTransport {
  /**
   * Connect to the MCP server
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the MCP server
   */
  disconnect(): Promise<void>;

  /**
   * Send a JSON-RPC request
   */
  send(message: JsonRpcRequest | JsonRpcNotification): Promise<void>;

  /**
   * Receive messages from the server
   */
  onMessage(callback: (message: JsonRpcResponse | JsonRpcNotification) => void): void;

  /**
   * Handle transport errors
   */
  onError(callback: (error: Error) => void): void;

  /**
   * Handle transport close
   */
  onClose(callback: () => void): void;

  /**
   * Check if transport is connected
   */
  isConnected(): boolean;
}

/**
 * Transport configuration types
 */

export interface StdioTransportConfig {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface HttpTransportConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

export interface WebSocketTransportConfig {
  type: 'websocket';
  url: string;
  protocols?: string[];
  headers?: Record<string, string>;
}

export type TransportConfig =
  | StdioTransportConfig
  | HttpTransportConfig
  | WebSocketTransportConfig;
