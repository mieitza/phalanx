import Docker from 'dockerode';
import { Executor, ExecutionConfig, ExecutionState } from './base';
import { ToolResult } from '@phalanx/schemas';
import { ToolExecutionError, createLogger } from '@phalanx/shared';

const logger = createLogger({ name: 'docker-executor' });

export interface DockerExecutionConfig extends ExecutionConfig {
  image?: string;
  limits?: {
    cpu?: number;
    memory?: string;
  };
  network?: string;
  volumes?: string[];
}

export class DockerExecutor extends Executor {
  private docker: Docker;
  private container?: Docker.Container;
  private state: ExecutionState;
  private outputBuffer: string[] = [];
  private errorBuffer: string[] = [];

  constructor(private id: string) {
    super();
    this.docker = new Docker();
    this.state = {
      id,
      status: 'pending',
      config: { command: '' },
    };
  }

  async execute(config: DockerExecutionConfig): Promise<ToolResult> {
    const startTime = Date.now();

    this.state = {
      ...this.state,
      status: 'running',
      config,
      startedAt: new Date(),
    };

    const image = config.image || process.env.SANDBOX_IMAGE || 'alpine:latest';

    logger.info({ execId: this.id, command: config.command, image }, 'Starting Docker execution');

    try {
      // Ensure image exists
      await this.ensureImage(image);

      // Create container
      this.container = await this.docker.createContainer({
        Image: image,
        Cmd: ['/bin/sh', '-c', config.command],
        WorkingDir: config.workingDir || '/workspace',
        Env: config.env ? Object.entries(config.env).map(([k, v]) => `${k}=${v}`) : undefined,
        HostConfig: {
          AutoRemove: true,
          NetworkMode: config.network || 'none',
          Memory: this.parseMemory(config.limits?.memory),
          NanoCpus: config.limits?.cpu ? config.limits.cpu * 1e9 : undefined,
          Binds: config.volumes,
          ReadonlyRootfs: true,
          CapDrop: ['ALL'],
          SecurityOpt: ['no-new-privileges'],
        },
        AttachStdout: true,
        AttachStderr: true,
      });

      // Attach to container streams
      const stream = await this.container.attach({
        stream: true,
        stdout: true,
        stderr: true,
      });

      // Handle output
      stream.on('data', (chunk: Buffer) => {
        const data = chunk.toString();
        this.outputBuffer.push(data);
        this.emit('stream', {
          type: 'stdout',
          data,
        });
      });

      // Start container
      await this.container.start();

      // Wait for container to complete
      const waitResult = await this.container.wait();
      const exitCode = waitResult.StatusCode;

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
          duration,
          outputLength: output.length,
        },
        'Docker execution completed'
      );

      this.emit('stream', {
        type: 'exit',
        exitCode,
      });

      const result: ToolResult = {
        status: exitCode === 0 ? 'success' : 'error',
        llmContent: output.substring(0, 10000),
        displayContent: output,
        exitCode,
        duration,
        metadata: {
          command: config.command,
          image,
          container: this.container.id,
        },
      };

      if (exitCode !== 0) {
        result.error = {
          type: 'EXECUTION_ERROR',
          message: `Container exited with code ${exitCode}`,
        };
      }

      return result;
    } catch (err) {
      logger.error({ err, execId: this.id }, 'Docker execution failed');
      this.state.status = 'failed';
      this.state.error = err as Error;
      throw new ToolExecutionError(`Docker execution failed: ${(err as Error).message}`, {
        execId: this.id,
        originalError: err,
      });
    }
  }

  async cancel(): Promise<void> {
    if (!this.container) {
      return;
    }

    logger.info({ execId: this.id }, 'Canceling Docker execution');

    this.state.status = 'canceled';

    try {
      await this.container.stop({ t: 5 });
      await this.container.remove({ force: true });
    } catch (err) {
      logger.error({ err, execId: this.id }, 'Error canceling Docker execution');
      throw err;
    }
  }

  getState(): ExecutionState {
    return { ...this.state };
  }

  private async ensureImage(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).inspect();
    } catch (err) {
      logger.info({ image }, 'Pulling Docker image');
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(image, (err: Error, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err);

          this.docker.modem.followProgress(stream, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      });
    }
  }

  private parseMemory(memory?: string): number | undefined {
    if (!memory) return undefined;

    const units: Record<string, number> = {
      b: 1,
      k: 1024,
      m: 1024 * 1024,
      g: 1024 * 1024 * 1024,
    };

    const match = memory.toLowerCase().match(/^(\d+)([bkmg])$/);
    if (!match) return undefined;

    const [, value, unit] = match;
    return parseInt(value, 10) * units[unit];
  }
}
