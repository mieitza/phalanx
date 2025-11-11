import type { WorkflowNode } from '@phalanx/schemas';
import type { WorkflowContext, NodeExecutionResult } from '../types';
import { NodeExecutor } from './base';
import { createLogger } from '@phalanx/shared';

const logger = createLogger({ name: 'tool-executor' });

export interface ToolNodeConfig {
  executor: 'shell' | 'docker';
  command: string;
  workingDir?: string;
  env?: Record<string, string>;
  timeout?: number;
  image?: string; // For Docker executor
}

export class ToolNodeExecutor extends NodeExecutor {
  readonly type = 'tool';

  constructor(
    private toolRunnerUrl: string = process.env.TOOL_RUNNER_URL || 'http://localhost:3003'
  ) {
    super();
  }

  async execute(
    node: WorkflowNode,
    context: WorkflowContext
  ): Promise<NodeExecutionResult> {
    const config = node.config as ToolNodeConfig;

    if (!config.command) {
      return {
        output: null,
        error: new Error('Tool node missing required "command" field'),
      };
    }

    // Resolve variables in command and environment
    const resolvedCommand = this.resolveValue(config.command, context) as string;
    const resolvedEnv = config.env
      ? Object.fromEntries(
          Object.entries(config.env).map(([k, v]) => [k, this.resolveValue(v, context)])
        )
      : undefined;

    logger.info({ nodeId: node.id, command: resolvedCommand }, 'Executing tool node');

    return this.executeWithRetry(async () => {
      try {
        const response = await fetch(`${this.toolRunnerUrl}/api/v1/exec`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            executor: config.executor || 'shell',
            command: resolvedCommand,
            workingDir: config.workingDir,
            env: resolvedEnv,
            timeout: config.timeout,
            image: config.image,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Tool Runner error (${response.status}): ${errorText}`);
        }

        const result = await response.json();

        if (result.exitCode !== 0) {
          logger.warn(
            { nodeId: node.id, exitCode: result.exitCode },
            'Tool execution completed with non-zero exit code'
          );
        }

        logger.info({ nodeId: node.id, exitCode: result.exitCode }, 'Tool node completed');

        return {
          output: result,
          metadata: {
            exitCode: result.exitCode,
            duration: result.duration,
          },
        };
      } catch (error) {
        logger.error({ nodeId: node.id, error }, 'Tool node execution failed');
        throw error;
      }
    }, 2, node.id); // Tools get fewer retries than LLM calls
  }

  private resolveValue(value: string, context: WorkflowContext): string {
    return value.replace(/\$\{([^}]+)\}/g, (match, path) => {
      const parts = path.split('.');

      if (parts[0] === 'outputs' && parts.length >= 2) {
        const nodeId = parts[1];
        const output = context.outputs.get(nodeId);

        if (!output) return match;

        let result: any = output;
        for (let i = 2; i < parts.length; i++) {
          if (result && typeof result === 'object') {
            result = result[parts[i]];
          } else {
            return match;
          }
        }

        return result !== undefined ? String(result) : match;
      }

      if (parts[0] === 'variables' && parts.length === 2) {
        const value = context.variables[parts[1]];
        return value !== undefined ? String(value) : match;
      }

      return match;
    });
  }
}
