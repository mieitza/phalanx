import { Command } from 'commander';
import inquirer from 'inquirer';
import { configManager } from '../config/index.js';
import { output, success, info } from '../utils/output.js';

export function createConfigCommand(): Command {
  const config = new Command('config')
    .description('Manage CLI configuration');

  // Show config
  config
    .command('show')
    .description('Show current configuration')
    .action(() => {
      const cfg = configManager.get();
      output(cfg, 'json');
    });

  // Set config value
  config
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action((key, value) => {
      const cfg = configManager.get();

      if (!(key in cfg)) {
        console.error(`Unknown config key: ${key}`);
        console.log('Valid keys:', Object.keys(cfg).join(', '));
        process.exit(1);
      }

      configManager.set(key as any, value);
      success(`Set ${key} = ${value}`);
    });

  // Interactive setup
  config
    .command('setup')
    .description('Interactive configuration setup')
    .action(async () => {
      const current = configManager.get();

      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'workflowServiceUrl',
          message: 'Workflow Service URL:',
          default: current.workflowServiceUrl,
        },
        {
          type: 'input',
          name: 'mcpServiceUrl',
          message: 'MCP Service URL:',
          default: current.mcpServiceUrl,
        },
        {
          type: 'input',
          name: 'apiGatewayUrl',
          message: 'API Gateway URL:',
          default: current.apiGatewayUrl,
        },
        {
          type: 'input',
          name: 'tenantId',
          message: 'Tenant ID:',
          default: current.tenantId,
        },
        {
          type: 'list',
          name: 'defaultFormat',
          message: 'Default output format:',
          choices: ['table', 'json'],
          default: current.defaultFormat,
        },
      ]);

      Object.entries(answers).forEach(([key, value]) => {
        configManager.set(key as any, value as string);
      });

      success('Configuration updated');
    });

  // Reset config
  config
    .command('reset')
    .description('Reset configuration to defaults')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (options) => {
      if (!options.yes) {
        const answers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: 'Are you sure you want to reset configuration?',
            default: false,
          },
        ]);

        if (!answers.confirmed) {
          console.log('Canceled');
          return;
        }
      }

      configManager.reset();
      success('Configuration reset to defaults');
    });

  // Show config path
  config
    .command('path')
    .description('Show configuration file path')
    .action(() => {
      info(`Configuration file: ${configManager.getPath()}`);
    });

  return config;
}
