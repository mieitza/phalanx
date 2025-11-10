import { Ollama } from 'ollama';
import { CompletionRequest, CompletionResponse, Message } from '@phalanx/schemas';
import { LLMProvider, StreamChunk, ProviderCapabilities } from './base';
import { LLMProviderError } from '@phalanx/shared';

export class OllamaProvider extends LLMProvider {
  name = 'ollama';
  capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: true, // Depends on model
    vision: false, // Depends on model
    maxContextTokens: 8192, // Varies by model
  };

  private client: Ollama;

  constructor(config: { host?: string }) {
    super();
    this.client = new Ollama({ host: config.host || 'http://localhost:11434' });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    try {
      const response = await this.client.chat({
        model: request.model,
        messages: this.formatMessages(request.messages),
        tools: request.tools?.map((t) => ({
          type: 'function',
          function: {
            name: t.function.name,
            description: t.function.description || '',
            parameters: t.function.parameters,
          },
        })),
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
        },
        stream: false,
      });

      return this.parseResponse(response);
    } catch (error: any) {
      throw new LLMProviderError(`Ollama API error: ${error.message}`, {
        provider: 'ollama',
        originalError: error,
      });
    }
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    try {
      const stream = await this.client.chat({
        model: request.model,
        messages: this.formatMessages(request.messages),
        tools: request.tools?.map((t) => ({
          type: 'function',
          function: {
            name: t.function.name,
            description: t.function.description || '',
            parameters: t.function.parameters,
          },
        })),
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
        },
        stream: true,
      });

      for await (const chunk of stream) {
        if (chunk.message?.content) {
          yield {
            type: 'token',
            content: chunk.message.content,
          };
        }

        if (chunk.message?.tool_calls) {
          for (const toolCall of chunk.message.tool_calls) {
            yield {
              type: 'tool_call',
              toolCall: {
                id: toolCall.function?.name || '',
                name: toolCall.function?.name || '',
                arguments: JSON.stringify(toolCall.function?.arguments || {}),
              },
            };
          }
        }

        if (chunk.done) {
          yield { type: 'done' };
        }
      }
    } catch (error: any) {
      yield {
        type: 'error',
        error: {
          message: error.message,
        },
      };
    }
  }

  async listModels() {
    const response = await this.client.list();
    return response.models.map((model) => ({
      id: model.name,
      name: model.name,
      contextWindow: 8192, // TODO: Parse from model details
    }));
  }

  protected formatMessages(messages: Message[]) {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      tool_calls: msg.toolCalls?.map((tc) => ({
        function: {
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        },
      })),
    }));
  }

  protected parseResponse(response: any): CompletionResponse {
    const estimatedTokens = this.estimateTokens([
      { role: 'assistant', content: response.message.content },
    ]);

    return {
      id: `ollama-${Date.now()}`,
      model: response.model,
      content: response.message.content,
      toolCalls: response.message.tool_calls?.map((tc: any, idx: number) => ({
        id: `call_${idx}`,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: JSON.stringify(tc.function.arguments),
        },
      })),
      usage: {
        promptTokens: response.prompt_eval_count || estimatedTokens,
        completionTokens: response.eval_count || estimatedTokens,
        totalTokens:
          (response.prompt_eval_count || estimatedTokens) +
          (response.eval_count || estimatedTokens),
      },
      finishReason: 'stop',
    };
  }
}
