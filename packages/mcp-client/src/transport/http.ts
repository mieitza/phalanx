import { createLogger } from '@phalanx/shared';
import type { MCPTransport } from '../types/transport';
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from '../types/protocol';

const logger = createLogger({ name: 'mcp-http-transport' });

export interface HttpTransportOptions {
  url: string;
  headers?: Record<string, string>;
}

export class HttpTransport implements MCPTransport {
  private messageCallbacks: Array<(message: JsonRpcResponse | JsonRpcNotification) => void> = [];
  private errorCallbacks: Array<(error: Error) => void> = [];
  private closeCallbacks: Array<() => void> = [];
  private connected = false;

  constructor(private options: HttpTransportOptions) {}

  async connect(): Promise<void> {
    logger.info({ url: this.options.url }, 'HTTP transport ready');
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    logger.info('HTTP transport disconnected');
    this.connected = false;
    this.closeCallbacks.forEach((cb) => cb());
  }

  async send(message: JsonRpcRequest | JsonRpcNotification): Promise<void> {
    if (!this.connected) {
      throw new Error('HTTP transport not connected');
    }

    logger.debug({ message }, 'Sending HTTP request');

    try {
      const response = await fetch(this.options.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.options.headers,
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      logger.debug({ response: data }, 'Received HTTP response');

      // For requests, trigger message callback with response
      if ('id' in message) {
        this.messageCallbacks.forEach((cb) => cb(data as JsonRpcResponse | JsonRpcNotification));
      }
    } catch (error) {
      logger.error({ error }, 'HTTP request failed');
      const err = error instanceof Error ? error : new Error(String(error));
      this.errorCallbacks.forEach((cb) => cb(err));
      throw err;
    }
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
