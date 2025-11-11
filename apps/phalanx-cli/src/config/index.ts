import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { createLogger } from '@phalanx/shared';

const logger = createLogger({ name: 'cli-config' });

export interface CLIConfig {
  workflowServiceUrl: string;
  mcpServiceUrl: string;
  apiGatewayUrl: string;
  tenantId: string;
  defaultFormat: 'json' | 'table';
}

const DEFAULT_CONFIG: CLIConfig = {
  workflowServiceUrl: 'http://localhost:3004',
  mcpServiceUrl: 'http://localhost:3005',
  apiGatewayUrl: 'http://localhost:3000',
  tenantId: 'default',
  defaultFormat: 'table',
};

export class ConfigManager {
  private configPath: string;
  private config: CLIConfig;

  constructor() {
    const configDir = join(homedir(), '.phalanx');
    this.configPath = join(configDir, 'config.json');

    // Ensure config directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Load or create config
    this.config = this.load();
  }

  private load(): CLIConfig {
    try {
      if (existsSync(this.configPath)) {
        const data = readFileSync(this.configPath, 'utf-8');
        const loaded = JSON.parse(data);
        return { ...DEFAULT_CONFIG, ...loaded };
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to load config, using defaults');
    }

    // Save default config
    this.save(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  private save(config: CLIConfig): void {
    try {
      const dir = dirname(this.configPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      logger.error({ error }, 'Failed to save config');
    }
  }

  get(): CLIConfig {
    return { ...this.config };
  }

  set(key: keyof CLIConfig, value: string): void {
    this.config[key] = value as any;
    this.save(this.config);
  }

  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.save(this.config);
  }

  getPath(): string {
    return this.configPath;
  }
}

export const configManager = new ConfigManager();
