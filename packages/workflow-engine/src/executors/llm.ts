import type { WorkflowNode } from '@phalanx/schemas';
import type { WorkflowContext, NodeExecutionResult } from '../types';
import { NodeExecutor } from './base';
import { createLogger } from '@phalanx/shared';

const logger = createLogger({ name: 'llm-executor' });

export interface LLMNodeConfig {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
}

export class LLMNodeExecutor extends NodeExecutor {
  readonly type = 'llm';

  constructor(
    private llmGatewayUrl: string = process.env.LLM_GATEWAY_URL || 'http://localhost:3002'
  ) {
    super();
  }

  async execute(
    node: WorkflowNode,
    context: WorkflowContext
  ): Promise<NodeExecutionResult> {
    const config = node.config as unknown as LLMNodeConfig;

    if (!config.model) {
      return {
        output: null,
        error: new Error('LLM node missing required "model" field'),
      };
    }

    // Resolve input variables in messages
    const resolvedMessages = config.messages.map(msg => ({
      role: msg.role,
      content: this.resolveValue(msg.content, context) as string,
    }));

    logger.info({ nodeId: node.id, model: config.model }, 'Executing LLM node');

    return this.executeWithRetry(async () => {
      try {
        const response = await fetch(`${this.llmGatewayUrl}/api/v1/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.model,
            messages: resolvedMessages,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            tools: config.tools,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`LLM Gateway error (${response.status}): ${errorText}`);
        }

        const result = await response.json();

        logger.info(
          {
            nodeId: node.id,
            model: config.model,
            tokensUsed: (result as any).usage?.totalTokens,
          },
          'LLM node completed'
        );

        return {
          output: result,
          metadata: {
            model: config.model,
            usage: (result as any).usage,
          },
        };
      } catch (error) {
        logger.error({ nodeId: node.id, error }, 'LLM node execution failed');
        throw error;
      }
    }, 3, node.id);
  }

}
