import OpenAI from 'openai';
import { CompletionRequest, CompletionResponse, Message } from '@phalanx/schemas';
import { LLMProvider, StreamChunk, ProviderCapabilities } from './base';
import { LLMProviderError } from '@phalanx/shared';

export class OpenAIProvider extends LLMProvider {
  name = 'openai';
  capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: true,
    vision: true,
    maxContextTokens: 128000, // GPT-4 Turbo
  };

  private client: OpenAI;

  constructor(config: { apiKey: string; baseURL?: string }) {
    super();
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: request.model,
        messages: this.formatMessages(request.messages),
        tools: request.tools,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: false,
      });

      return this.parseResponse(response);
    } catch (error: any) {
      throw new LLMProviderError(`OpenAI API error: ${error.message}`, {
        provider: 'openai',
        originalError: error,
      });
    }
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    try {
      const stream = await this.client.chat.completions.create({
        model: request.model,
        messages: this.formatMessages(request.messages),
        tools: request.tools,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          yield {
            type: 'token',
            content: delta.content,
          };
        }

        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            if (toolCall.function) {
              yield {
                type: 'tool_call',
                toolCall: {
                  id: toolCall.id || '',
                  name: toolCall.function.name || '',
                  arguments: toolCall.function.arguments || '',
                },
              };
            }
          }
        }

        if (chunk.choices[0]?.finish_reason) {
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
    const models = await this.client.models.list();
    return models.data
      .filter((m) => m.id.startsWith('gpt'))
      .map((m) => ({
        id: m.id,
        name: m.id,
        contextWindow: this.getContextWindow(m.id),
      }));
  }

  protected formatMessages(messages: Message[]) {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      name: msg.name,
      tool_calls: msg.toolCalls,
      tool_call_id: msg.toolCallId,
    }));
  }

  protected parseResponse(response: any): CompletionResponse {
    const choice = response.choices[0];
    return {
      id: response.id,
      model: response.model,
      content: choice.message.content,
      toolCalls: choice.message.tool_calls?.map((tc: any) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
      finishReason: choice.finish_reason,
    };
  }

  private getContextWindow(modelId: string): number {
    if (modelId.includes('gpt-4-turbo') || modelId.includes('gpt-4-1106')) return 128000;
    if (modelId.includes('gpt-4-32k')) return 32768;
    if (modelId.includes('gpt-4')) return 8192;
    if (modelId.includes('gpt-3.5-turbo-16k')) return 16384;
    if (modelId.includes('gpt-3.5')) return 4096;
    return 8192; // default
  }
}
