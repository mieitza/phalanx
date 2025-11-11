#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createWorkflowCommand } from './commands/workflow.js';
import { createRunCommand } from './commands/run.js';
import { createMCPCommand } from './commands/mcp.js';
import { createConfigCommand } from './commands/config.js';
import { createTUICommand } from './commands/tui.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
const packageJsonPath = join(__dirname, '../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

const program = new Command();

program
  .name('phalanx')
  .description('Phalanx - Self-Hosted LLM Automation Platform CLI')
  .version(packageJson.version);

// Register commands
program.addCommand(createWorkflowCommand());
program.addCommand(createRunCommand());
program.addCommand(createMCPCommand());
program.addCommand(createConfigCommand());
program.addCommand(createTUICommand());

// Add global error handler
process.on('unhandledRejection', (reason: any) => {
  console.error('Error:', reason.message || reason);
  process.exit(1);
});

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
