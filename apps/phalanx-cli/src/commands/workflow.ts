import { Command } from 'commander';
import ora from 'ora';
import inquirer from 'inquirer';
import { readFileSync } from 'fs';
import { createWorkflowClient } from '../utils/api.js';
import { output, outputTable, success, error, formatStatus, formatDate, truncate } from '../utils/output.js';

export function createWorkflowCommand(): Command {
  const workflow = new Command('workflow')
    .alias('wf')
    .description('Manage workflows');

  // List workflows
  workflow
    .command('list')
    .alias('ls')
    .description('List all workflows')
    .option('-f, --format <format>', 'Output format (json|table)', 'table')
    .action(async (options) => {
      const spinner = ora('Loading workflows...').start();

      try {
        const client = createWorkflowClient();
        const data = await client.get<{ workflows: any[] }>('/api/v1/workflows');

        spinner.stop();

        if (options.format === 'json') {
          output(data.workflows, 'json');
        } else {
          if (data.workflows.length === 0) {
            console.log('No workflows found');
            return;
          }

          outputTable(
            ['ID', 'Name', 'Version', 'Nodes', 'Created'],
            data.workflows.map(wf => [
              truncate(wf.id, 20),
              truncate(wf.name, 30),
              wf.version || '1.0.0',
              String(wf.nodes?.length || 0),
              formatDate(wf.createdAt),
            ])
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(`Failed to list workflows: ${err.message}`);
        process.exit(1);
      }
    });

  // Get workflow details
  workflow
    .command('get <id>')
    .description('Get workflow details')
    .option('-f, --format <format>', 'Output format (json|table)', 'json')
    .action(async (id, options) => {
      const spinner = ora('Loading workflow...').start();

      try {
        const client = createWorkflowClient();
        const data = await client.get(`/api/v1/workflows/${id}`);

        spinner.stop();
        output(data, options.format);
      } catch (err: any) {
        spinner.stop();
        error(`Failed to get workflow: ${err.message}`);
        process.exit(1);
      }
    });

  // Create workflow
  workflow
    .command('create <file>')
    .description('Create a new workflow from JSON file')
    .action(async (file) => {
      const spinner = ora('Creating workflow...').start();

      try {
        const content = readFileSync(file, 'utf-8');
        const workflowData = JSON.parse(content);

        const client = createWorkflowClient();
        const data = await client.post('/api/v1/workflows', workflowData);

        spinner.stop();
        success(`Workflow created: ${(data as any).id}`);
        output(data, 'json');
      } catch (err: any) {
        spinner.stop();
        error(`Failed to create workflow: ${err.message}`);
        process.exit(1);
      }
    });

  // Delete workflow
  workflow
    .command('delete <id>')
    .description('Delete a workflow')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (id, options) => {
      if (!options.yes) {
        const answers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: `Are you sure you want to delete workflow ${id}?`,
            default: false,
          },
        ]);

        if (!answers.confirmed) {
          console.log('Canceled');
          return;
        }
      }

      const spinner = ora('Deleting workflow...').start();

      try {
        const client = createWorkflowClient();
        await client.delete(`/api/v1/workflows/${id}`);

        spinner.stop();
        success(`Workflow deleted: ${id}`);
      } catch (err: any) {
        spinner.stop();
        error(`Failed to delete workflow: ${err.message}`);
        process.exit(1);
      }
    });

  return workflow;
}
