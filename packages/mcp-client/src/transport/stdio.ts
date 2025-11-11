import { spawn, ChildProcess } from 'child_process';
import { createLogger } from '@phalanx/shared';
import type { MCPTransport } from '../types/transport';
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from '../types/protocol';

const logger = createLogger({ name: 'mcp-stdio-transport' });

export interface StdioTransportOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class StdioTransport implements MCPTransport {
  private process?: ChildProcess;
  private messageCallbacks: Array<(message: JsonRpcResponse | JsonRpcNotification) => void> = [];
  private errorCallbacks: Array<(error: Error) => void> = [];
  private closeCallbacks: Array<() => void> = [];
  private connected = false;
  private buffer = '';

  constructor(private options: StdioTransportOptions) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info({ command: this.options.command, args: this.options.args }, 'Starting MCP server process');

      this.process = spawn(this.options.command, this.options.args || [], {
        env: { ...process.env, ...this.options.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (!this.process.stdout || !this.process.stdin) {
        reject(new Error('Failed to create stdio pipes'));
        return;
      }

      this.process.stdout.on('data', (data: Buffer) => {
        this.buffer += data.toString();

        // Process complete JSON messages
        let newlineIndex: number;
        while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
          const line = this.buffer.slice(0, newlineIndex).trim();
          this.buffer = this.buffer.slice(newlineIndex + 1);

          if (line) {
            try {
              const message = JSON.parse(line);
              logger.debug({ message }, 'Received message');
              this.messageCallbacks.forEach((cb) => cb(message));
            } catch (error) {
              logger.error({ error, line }, 'Failed to parse message');
              const err = error instanceof Error ? error : new Error(String(error));
              this.errorCallbacks.forEach((cb) => cb(err));
            }
          }
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        logger.warn({ stderr: data.toString() }, 'Server stderr output');
      });

      this.process.on('error', (error) => {
        logger.error({ error }, 'Process error');
        this.errorCallbacks.forEach((cb) => cb(error));
        reject(error);
      });

      this.process.on('exit', (code, signal) => {
        logger.info({ code, signal }, 'Process exited');
        this.connected = false;
        this.closeCallbacks.forEach((cb) => cb());
      });

      // Wait a bit for process to start
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.connected = true;
          resolve();
        } else {
          reject(new Error('Process failed to start'));
        }
      }, 500);
    });
  }

  async disconnect(): Promise<void> {
    if (this.process && !this.process.killed) {
      logger.info('Killing MCP server process');
      this.process.kill();
      this.process = undefined;
      this.connected = false;
    }
  }

  async send(message: JsonRpcRequest | JsonRpcNotification): Promise<void> {
    if (!this.process || !this.process.stdin || !this.connected) {
      throw new Error('Process not connected');
    }

    logger.debug({ message }, 'Sending message');
    const data = JSON.stringify(message) + '\n';
    this.process.stdin.write(data);
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
