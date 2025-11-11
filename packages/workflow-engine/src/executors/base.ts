import type { WorkflowNode } from '@phalanx/schemas';
import type { WorkflowContext, NodeExecutionResult } from '../types';
import { createLogger } from '@phalanx/shared';

const logger = createLogger({ name: 'node-executor' });

export abstract class NodeExecutor {
  abstract readonly type: string;

  /**
   * Execute a workflow node
   * @param node - The workflow node to execute
   * @param context - The workflow execution context
   * @returns The execution result
   */
  abstract execute(
    node: WorkflowNode,
    context: WorkflowContext
  ): Promise<NodeExecutionResult>;

  /**
   * Resolve input variables by replacing placeholders with actual values
   * Supports syntax like: ${outputs.nodeId.field} and ${variables.varName}
   */
  protected resolveInputs(
    inputs: Record<string, unknown>,
    context: WorkflowContext
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(inputs)) {
      resolved[key] = this.resolveValue(value, context);
    }

    return resolved;
  }

  private resolveValue(value: unknown, context: WorkflowContext): unknown {
    if (typeof value === 'string') {
      // Replace ${outputs.nodeId.field} syntax
      return value.replace(/\$\{([^}]+)\}/g, (match, path) => {
        const parts = path.split('.');

        if (parts[0] === 'outputs' && parts.length >= 2) {
          const nodeId = parts[1];
          const output = context.outputs.get(nodeId);

          if (!output) {
            logger.warn({ nodeId, path }, 'Output not found for node');
            return match;
          }

          // Navigate nested path
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
          const varName = parts[1];
          const value = context.variables[varName];
          return value !== undefined ? String(value) : match;
        }

        return match;
      });
    }

    if (Array.isArray(value)) {
      return value.map(item => this.resolveValue(item, context));
    }

    if (value && typeof value === 'object') {
      const resolved: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        resolved[k] = this.resolveValue(v, context);
      }
      return resolved;
    }

    return value;
  }

  /**
   * Handle execution errors with retries
   */
  protected async executeWithRetry(
    fn: () => Promise<NodeExecutionResult>,
    maxRetries: number = 3,
    nodeId: string
  ): Promise<NodeExecutionResult> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        logger.warn(
          { nodeId, attempt, maxRetries, error },
          'Node execution attempt failed'
        );

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return {
      output: null,
      error: lastError || new Error('Unknown error'),
    };
  }
}
