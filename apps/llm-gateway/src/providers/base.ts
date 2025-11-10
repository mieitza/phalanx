import { CompletionRequest, CompletionResponse, Message } from '@phalanx/schemas';

export interface StreamChunk {
  type: 'token' | 'tool_call' | 'done' | 'error';
  content?: string;
  toolCall?: {
    id: string;
    name: string;
    arguments: string;
  };
  error?: {
    message: string;
    code?: string;
  };
}

export interface ProviderCapabilities {
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
  maxContextTokens: number;
}

export abstract class LLMProvider {
  abstract name: string;
  abstract capabilities: ProviderCapabilities;

  abstract complete(request: CompletionRequest): Promise<CompletionResponse>;

  abstract stream(request: CompletionRequest): AsyncGenerator<StreamChunk>;

  abstract listModels(): Promise<Array<{ id: string; name: string; contextWindow: number }>>;

  /**
   * Convert internal message format to provider-specific format
   */
  protected abstract formatMessages(messages: Message[]): any;

  /**
   * Convert provider response to internal format
   */
  protected abstract parseResponse(response: any): CompletionResponse;

  /**
   * Estimate token count for messages
   */
  protected estimateTokens(messages: Message[]): number {
    // Simple estimation: ~4 chars per token
    const text = messages.map((m) => m.content).join(' ');
    return Math.ceil(text.length / 4);
  }
}
