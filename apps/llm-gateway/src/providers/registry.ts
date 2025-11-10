import { LLMProvider } from './base';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { OllamaProvider } from './ollama';
import { createLogger, ConfigurationError } from '@phalanx/shared';

const logger = createLogger({ name: 'provider-registry' });

export class ProviderRegistry {
  private providers = new Map<string, LLMProvider>();
  private aliases = new Map<string, string>();

  async initialize() {
    logger.info('Initializing LLM providers');

    // Initialize OpenAI
    if (process.env.OPENAI_API_KEY) {
      const provider = new OpenAIProvider({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL,
      });
      this.providers.set('openai', provider);
      logger.info('OpenAI provider initialized');
    }

    // Initialize Anthropic
    if (process.env.ANTHROPIC_API_KEY) {
      const provider = new AnthropicProvider({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      this.providers.set('anthropic', provider);
      logger.info('Anthropic provider initialized');
    }

    // Initialize Ollama (always available for local use)
    const ollamaProvider = new OllamaProvider({
      host: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    });
    this.providers.set('ollama', ollamaProvider);
    logger.info('Ollama provider initialized');

    // Setup default aliases
    this.setupAliases();

    logger.info({ providerCount: this.providers.size }, 'Provider registry initialized');
  }

  private setupAliases() {
    // Common model aliases
    this.aliases.set('gpt-4', 'openai');
    this.aliases.set('gpt-3.5-turbo', 'openai');
    this.aliases.set('claude-3', 'anthropic');
    this.aliases.set('claude-3.5', 'anthropic');
    this.aliases.set('llama', 'ollama');
    this.aliases.set('llama3.1', 'ollama');
  }

  getProvider(modelId: string): LLMProvider {
    // Try to parse provider from model ID (e.g., "openai/gpt-4")
    const parts = modelId.split('/');
    let providerName: string;
    let actualModelId: string;

    if (parts.length === 2) {
      [providerName, actualModelId] = parts;
    } else {
      // Try to detect provider from model name
      providerName = this.detectProvider(modelId);
      actualModelId = modelId;
    }

    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new ConfigurationError(`Provider '${providerName}' not configured`, {
        modelId,
        availableProviders: Array.from(this.providers.keys()),
      });
    }

    return provider;
  }

  private detectProvider(modelId: string): string {
    // Check aliases
    for (const [prefix, provider] of this.aliases.entries()) {
      if (modelId.startsWith(prefix)) {
        return provider;
      }
    }

    // Default to ollama for local models
    return 'ollama';
  }

  async listAllModels() {
    const allModels = [];

    for (const [providerName, provider] of this.providers.entries()) {
      try {
        const models = await provider.listModels();
        allModels.push(
          ...models.map((m) => ({
            ...m,
            id: `${providerName}/${m.id}`,
            provider: providerName,
          }))
        );
      } catch (err) {
        logger.warn({ providerName, error: err }, 'Failed to list models from provider');
      }
    }

    return allModels;
  }

  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }
}
