import { execa } from 'execa';
import { Executor, ExecutionConfig, ExecutionState } from './base';
import { ToolResult } from '@phalanx/schemas';
import { ToolExecutionError, createLogger } from '@phalanx/shared';

const logger = createLogger({ name: 'shell-executor' });

// Try to load node-pty optionally (requires native compilation)
let pty: any = null;
try {
  pty = await import('node-pty');
  logger.info('node-pty loaded successfully - using PTY mode');
} catch (err) {
  logger.info('node-pty not available - using standard process mode (no TTY)');
}

export class ShellExecutor extends Executor {
  private process?: any;
  private state: ExecutionState;
  private outputBuffer: string[] = [];
  private errorBuffer: string[] = [];
  private timeoutHandle?: NodeJS.Timeout;

  constructor(private id: string) {
    super();
    this.state = {
      id,
      status: 'pending',
      config: { command: '' },
    };
  }

  async execute(config: ExecutionConfig): Promise<ToolResult> {
    const startTime = Date.now();

    this.state = {
      ...this.state,
      status: 'running',
      config,
      startedAt: new Date(),
    };

    logger.info({ execId: this.id, command: config.command, hasPty: !!pty }, 'Starting shell execution');

    // Use PTY if available, otherwise use execa
    if (pty) {
      return this.executePty(config, startTime);
    } else {
      return this.executeExeca(config, startTime);
    }
  }

  private async executePty(config: ExecutionConfig, startTime: number): Promise<ToolResult> {
    return new Promise((resolve, reject) => {
      try {
        const shell = config.shell || (process.platform === 'win32' ? 'powershell.exe' : 'bash');
        const cwd = config.workingDir || process.cwd();

        // Spawn PTY process
        this.process = pty.spawn(shell, ['-c', config.command], {
          name: 'xterm-color',
          cols: 80,
          rows: 30,
          cwd,
          env: { ...process.env, ...config.env },
        });

        // Handle stdout/stderr (PTY combines both)
        this.process.onData((data: string) => {
          this.outputBuffer.push(data);
          this.emit('stream', {
            type: 'stdout',
            data,
          });
        });

        // Handle exit
        this.process.onExit(({ exitCode, signal }: any) => {
          if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
          }

          resolve(this.createResult(exitCode, signal, startTime));
        });

        // Setup timeout
        this.setupTimeout(config, reject);
      } catch (err) {
        this.handleError(err, reject);
      }
    });
  }

  private async executeExeca(config: ExecutionConfig, startTime: number): Promise<ToolResult> {
    try {
      const shell = config.shell || (process.platform === 'win32' ? 'powershell.exe' : 'bash');
      const cwd = config.workingDir || process.cwd();

      this.process = execa(shell, ['-c', config.command], {
        cwd,
        env: { ...process.env, ...config.env },
        timeout: config.timeout,
        all: true, // Combine stdout and stderr
      });

      // Stream output
      if (this.process.stdout) {
        this.process.stdout.on('data', (data: Buffer) => {
          const text = data.toString();
          this.outputBuffer.push(text);
          this.emit('stream', {
            type: 'stdout',
            data: text,
          });
        });
      }

      if (this.process.stderr) {
        this.process.stderr.on('data', (data: Buffer) => {
          const text = data.toString();
          this.errorBuffer.push(text);
          this.emit('stream', {
            type: 'stderr',
            data: text,
          });
        });
      }

      const result = await this.process;
      return this.createResult(result.exitCode, result.signal, startTime);
    } catch (err: any) {
      // execa throws on non-zero exit
      if (err.exitCode !== undefined) {
        return this.createResult(err.exitCode, err.signal, startTime);
      }
      throw err;
    }
  }

  private createResult(exitCode: number, signal: string | undefined, startTime: number): ToolResult {
    const duration = Date.now() - startTime;
    const output = this.outputBuffer.join('');
    const error = this.errorBuffer.join('');

    this.state = {
      ...this.state,
      status: exitCode === 0 ? 'completed' : 'failed',
      endedAt: new Date(),
      exitCode,
    };

    logger.info(
      {
        execId: this.id,
        exitCode,
        signal,
        duration,
        outputLength: output.length,
      },
      'Shell execution completed'
    );

    this.emit('stream', {
      type: 'exit',
      exitCode,
    });

    const result: ToolResult = {
      status: exitCode === 0 ? 'success' : 'error',
      llmContent: output.substring(0, 10000), // Limit for LLM
      displayContent: output + (error ? `\n\nSTDERR:\n${error}` : ''),
      exitCode,
      duration,
      metadata: {
        command: this.state.config.command,
        signal,
      },
    };

    if (exitCode !== 0) {
      result.error = {
        type: 'EXECUTION_ERROR',
        message: `Command exited with code ${exitCode}`,
      };
    }

    return result;
  }

  private setupTimeout(config: ExecutionConfig, reject: (err: Error) => void) {
    if (config.timeout) {
      this.timeoutHandle = setTimeout(() => {
        logger.warn({ execId: this.id, timeout: config.timeout }, 'Execution timeout');
        this.cancel()
          .then(() => {
            reject(
              new ToolExecutionError(`Execution timeout after ${config.timeout}ms`, {
                execId: this.id,
              })
            );
          })
          .catch(reject);
      }, config.timeout);
    }
  }

  private handleError(err: any, reject: (err: Error) => void) {
    logger.error({ err, execId: this.id }, 'Shell execution failed');
    this.state.status = 'failed';
    this.state.error = err as Error;
    reject(err);
  }

  async cancel(): Promise<void> {
    if (!this.process) {
      return;
    }

    logger.info({ execId: this.id }, 'Canceling shell execution');

    this.state.status = 'canceled';

    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }

    try {
      if (pty && this.process.kill) {
        // PTY mode
        this.process.kill('SIGTERM');

        // Force kill after 5 seconds
        await new Promise<void>((resolve) => {
          const forceKillTimeout = setTimeout(() => {
            if (this.process) {
              this.process.kill('SIGKILL');
            }
            resolve();
          }, 5000);

          this.process.onExit(() => {
            clearTimeout(forceKillTimeout);
            resolve();
          });
        });
      } else if (this.process.kill) {
        // execa mode
        this.process.kill('SIGTERM', { forceKillAfterTimeout: 5000 });
      }
    } catch (err) {
      logger.error({ err, execId: this.id }, 'Error canceling execution');
      throw err;
    }
  }

  getState(): ExecutionState {
    return { ...this.state };
  }
}
