import WebSocket from 'ws';
import { createLogger } from '@phalanx/shared';
import type { MCPTransport } from '../types/transport';
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from '../types/protocol';

const logger = createLogger({ name: 'mcp-websocket-transport' });

export interface WebSocketTransportOptions {
  url: string;
  protocols?: string[];
  headers?: Record<string, string>;
}

export class WebSocketTransport implements MCPTransport {
  private ws?: WebSocket;
  private messageCallbacks: Array<(message: JsonRpcResponse | JsonRpcNotification) => void> = [];
  private errorCallbacks: Array<(error: Error) => void> = [];
  private closeCallbacks: Array<() => void> = [];
  private connected = false;

  constructor(private options: WebSocketTransportOptions) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info({ url: this.options.url }, 'Connecting to WebSocket MCP server');

      this.ws = new WebSocket(this.options.url, this.options.protocols, {
        headers: this.options.headers,
      });

      this.ws.on('open', () => {
        logger.info('WebSocket connected');
        this.connected = true;
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          logger.debug({ message }, 'Received message');
          this.messageCallbacks.forEach((cb) => cb(message));
        } catch (error) {
          logger.error({ error }, 'Failed to parse message');
          const err = error instanceof Error ? error : new Error(String(error));
          this.errorCallbacks.forEach((cb) => cb(err));
        }
      });

      this.ws.on('error', (error) => {
        logger.error({ error }, 'WebSocket error');
        this.errorCallbacks.forEach((cb) => cb(error));
        reject(error);
      });

      this.ws.on('close', () => {
        logger.info('WebSocket closed');
        this.connected = false;
        this.closeCallbacks.forEach((cb) => cb());
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      logger.info('Disconnecting WebSocket');
      this.ws.close();
      this.ws = undefined;
      this.connected = false;
    }
  }

  async send(message: JsonRpcRequest | JsonRpcNotification): Promise<void> {
    if (!this.ws || !this.connected) {
      throw new Error('WebSocket not connected');
    }

    logger.debug({ message }, 'Sending message');
    this.ws.send(JSON.stringify(message));
  }

  onMessage(callback: (message: JsonRpcResponse | JsonRpcNotification) => void): void {
    this.messageCallbacks.push(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  onClose(callback: () => void): void {
    this.closeCallbacks.push(callback);
  }

  isConnected(): boolean {
    return this.connected;
  }
}
