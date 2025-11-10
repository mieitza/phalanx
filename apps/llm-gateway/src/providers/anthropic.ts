import Anthropic from '@anthropic-ai/sdk';
import { CompletionRequest, CompletionResponse, Message } from '@phalanx/schemas';
import { LLMProvider, StreamChunk, ProviderCapabilities } from './base';
import { LLMProviderError } from '@phalanx/shared';

export class AnthropicProvider extends LLMProvider {
  name = 'anthropic';
  capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: true,
    vision: true,
    maxContextTokens: 200000, // Claude 3
  };

  private client: Anthropic;

  constructor(config: { apiKey: string }) {
    super();
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    try {
      const { system, messages } = this.formatMessages(request.messages);

      const response = await this.client.messages.create({
        model: request.model,
        system,
        messages,
        tools: this.formatTools(request.tools),
        temperature: request.temperature,
        max_tokens: request.maxTokens || 4096,
        stream: false,
      });

      return this.parseResponse(response);
    } catch (error: any) {
      throw new LLMProviderError(`Anthropic API error: ${error.message}`, {
        provider: 'anthropic',
        originalError: error,
      });
    }
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    try {
      const { system, messages } = this.formatMessages(request.messages);

      const stream = await this.client.messages.create({
        model: request.model,
        system,
        messages,
        tools: this.formatTools(request.tools),
        temperature: request.temperature,
        max_tokens: request.maxTokens || 4096,
        stream: true,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield {
              type: 'token',
              content: event.delta.text,
            };
          }
        }

        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            yield {
              type: 'tool_call',
              toolCall: {
                id: event.content_block.id,
                name: event.content_block.name,
                arguments: JSON.stringify(event.content_block.input),
              },
            };
          }
        }

        if (event.type === 'message_stop') {
          yield { type: 'done' };
        }
      }
    } catch (error: any) {
      yield {
        type: 'error',
        error: {
          message: error.message,
          code: error.code,
        },
      };
    }
  }

  async listModels() {
    // Anthropic doesn't have a models list endpoint, return known models
    return [
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextWindow: 200000 },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', contextWindow: 200000 },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', contextWindow: 200000 },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindow: 200000 },
    ];
  }

  protected formatMessages(messages: Message[]) {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const otherMessages = messages.filter((m) => m.role !== 'system');

    const system = systemMessages.map((m) => m.content).join('\n\n');

    const formattedMessages = otherMessages.map((msg) => {
      if (msg.role === 'assistant' && msg.toolCalls) {
        return {
          role: 'assistant',
          content: msg.toolCalls.map((tc) => ({
            type: 'tool_use' as const,
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          })),
        };
      }

      if (msg.role === 'tool') {
        return {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: msg.toolCallId,
              content: msg.content,
            },
          ],
        };
      }

      return {
        role: msg.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: msg.content,
      };
    });

    return { system, messages: formattedMessages };
  }

  protected parseResponse(response: any): CompletionResponse {
    const textContent = response.content.find((c: any) => c.type === 'text');
    const toolCalls = response.content
      .filter((c: any) => c.type === 'tool_use')
      .map((c: any) => ({
        id: c.id,
        type: 'function' as const,
        function: {
          name: c.name,
          arguments: JSON.stringify(c.input),
        },
      }));

    return {
      id: response.id,
      model: response.model,
      content: textContent?.text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      finishReason: response.stop_reason === 'end_turn' ? 'stop' : response.stop_reason,
    };
  }

  private formatTools(tools?: any[]) {
    if (!tools) return undefined;

    return tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    }));
  }
}
