import { Executor, ExecutionConfig } from '../executors/base';
import { ShellExecutor } from '../executors/shell';
import { DockerExecutor } from '../executors/docker';
import { ToolResult } from '@phalanx/schemas';
import { createLogger } from '@phalanx/shared';
import { PolicyEngine } from '../policy/engine';

const logger = createLogger({ name: 'execution-manager' });

export interface ExecutionOptions {
  sandbox?: boolean;
  policy?: {
    confirm?: boolean;
    timeout?: number;
  };
}

export class ExecutionManager {
  private executions = new Map<string, Executor>();

  constructor(private policyEngine: PolicyEngine) {}

  async execute(
    config: ExecutionConfig,
    options: ExecutionOptions = {}
  ): Promise<{ id: string; result?: ToolResult }> {
    const execId = this.generateId();

    // Check policy
    const decision = await this.policyEngine.evaluate({
      tool: 'shell',
      command: config.command,
      ...options.policy,
    });

    if (decision.decision === 'deny') {
      logger.warn({ execId, command: config.command, reason: decision.reason }, 'Execution denied');
      throw new Error(`Execution denied: ${decision.reason}`);
    }

    if (decision.decision === 'ask_user') {
      logger.info({ execId, command: config.command }, 'Execution requires user confirmation');
      // Return execution ID for confirmation workflow
      return { id: execId };
    }

    // Create executor
    const useSandbox = options.sandbox ?? process.env.SANDBOX_EXECUTOR === 'docker';
    const executor = useSandbox
      ? new DockerExecutor(execId)
      : new ShellExecutor(execId);

    this.executions.set(execId, executor);

    logger.info(
      {
        execId,
        command: config.command,
        executor: useSandbox ? 'docker' : 'shell',
      },
      'Starting execution'
    );

    try {
      const result = await executor.execute(config);
      return { id: execId, result };
    } catch (err) {
      logger.error({ err, execId }, 'Execution failed');
      throw err;
    } finally {
      // Clean up after a delay
      setTimeout(() => {
        this.executions.delete(execId);
      }, 60000); // Keep for 1 minute for streaming
    }
  }

  async cancel(execId: string): Promise<void> {
    const executor = this.executions.get(execId);
    if (!executor) {
      throw new Error(`Execution ${execId} not found`);
    }

    await executor.cancel();
  }

  getExecution(execId: string): Executor | undefined {
    return this.executions.get(execId);
  }

  getState(execId: string) {
    const executor = this.executions.get(execId);
    return executor?.getState();
  }

  private generateId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}
