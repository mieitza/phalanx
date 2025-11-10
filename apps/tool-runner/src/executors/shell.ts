import * as pty from 'node-pty';
import { Executor, ExecutionConfig, ExecutionState, ExecutionStatus } from './base';
import { ToolResult } from '@phalanx/schemas';
import { ToolExecutionError, createLogger } from '@phalanx/shared';

const logger = createLogger({ name: 'shell-executor' });

export class ShellExecutor extends Executor {
  private ptyProcess?: pty.IPty;
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

    logger.info({ execId: this.id, command: config.command }, 'Starting shell execution');

    return new Promise((resolve, reject) => {
      try {
        const shell = config.shell || process.platform === 'win32' ? 'powershell.exe' : 'bash';
        const cwd = config.workingDir || process.cwd();

        // Spawn PTY process
        this.ptyProcess = pty.spawn(shell, ['-c', config.command], {
          name: 'xterm-color',
          cols: 80,
          rows: 30,
          cwd,
          env: { ...process.env, ...config.env },
        });

        // Handle stdout/stderr (PTY combines both)
        this.ptyProcess.onData((data) => {
          this.outputBuffer.push(data);
          this.emit('stream', {
            type: 'stdout',
            data,
          });
        });

        // Handle exit
        this.ptyProcess.onExit(({ exitCode, signal }) => {
          if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
          }

          const duration = Date.now() - startTime;
          const output = this.outputBuffer.join('');

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
            displayContent: output,
            exitCode,
            duration,
            metadata: {
              command: config.command,
              signal,
            },
          };

          if (exitCode !== 0) {
            result.error = {
              type: 'EXECUTION_ERROR',
              message: `Command exited with code ${exitCode}`,
            };
          }

          resolve(result);
        });

        // Setup timeout
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
      } catch (err) {
        logger.error({ err, execId: this.id }, 'Shell execution failed');
        this.state.status = 'failed';
        this.state.error = err as Error;
        reject(err);
      }
    });
  }

  async cancel(): Promise<void> {
    if (!this.ptyProcess) {
      return;
    }

    logger.info({ execId: this.id }, 'Canceling shell execution');

    this.state.status = 'canceled';

    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }

    try {
      // Try graceful termination first
      this.ptyProcess.kill('SIGTERM');

      // Force kill after 5 seconds
      await new Promise<void>((resolve) => {
        const forceKillTimeout = setTimeout(() => {
          if (this.ptyProcess) {
            this.ptyProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        this.ptyProcess!.onExit(() => {
          clearTimeout(forceKillTimeout);
          resolve();
        });
      });
    } catch (err) {
      logger.error({ err, execId: this.id }, 'Error canceling execution');
      throw err;
    }
  }

  getState(): ExecutionState {
    return { ...this.state };
  }
}
