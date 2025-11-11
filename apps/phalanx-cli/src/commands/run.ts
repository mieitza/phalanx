import { Command } from 'commander';
import ora from 'ora';
import inquirer from 'inquirer';
import { readFileSync } from 'fs';
import { createWorkflowClient } from '../utils/api.js';
import { output, outputTable, success, error, info, formatStatus, formatDate, truncate } from '../utils/output.js';

export function createRunCommand(): Command {
  const run = new Command('run')
    .description('Manage workflow runs');

  // List runs
  run
    .command('list')
    .alias('ls')
    .description('List workflow runs')
    .option('-w, --workflow <id>', 'Filter by workflow ID')
    .option('-s, --status <status>', 'Filter by status')
    .option('-f, --format <format>', 'Output format (json|table)', 'table')
    .action(async (options) => {
      const spinner = ora('Loading runs...').start();

      try {
        const client = createWorkflowClient();
        let path = '/api/v1/runs';
        const params = new URLSearchParams();

        if (options.workflow) params.append('workflowId', options.workflow);
        if (options.status) params.append('status', options.status);

        if (params.toString()) {
          path += `?${params.toString()}`;
        }

        const data = await client.get<{ runs: any[] }>(path);

        spinner.stop();

        if (options.format === 'json') {
          output(data.runs, 'json');
        } else {
          if (data.runs.length === 0) {
            console.log('No runs found');
            return;
          }

          outputTable(
            ['ID', 'Workflow', 'Status', 'Started', 'Duration'],
            data.runs.map(r => [
              truncate(r.id, 20),
              truncate(r.workflowId, 20),
              formatStatus(r.status),
              formatDate(r.startedAt),
              r.endedAt
                ? `${Math.round((new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()) / 1000)}s`
                : '-',
            ])
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(`Failed to list runs: ${err.message}`);
        process.exit(1);
      }
    });

  // Get run details
  run
    .command('get <id>')
    .description('Get run details')
    .option('-f, --format <format>', 'Output format (json|table)', 'json')
    .action(async (id, options) => {
      const spinner = ora('Loading run...').start();

      try {
        const client = createWorkflowClient();
        const data = await client.get(`/api/v1/runs/${id}`);

        spinner.stop();
        output(data, options.format);
      } catch (err: any) {
        spinner.stop();
        error(`Failed to get run: ${err.message}`);
        process.exit(1);
      }
    });

  // Execute workflow
  run
    .command('execute <workflowId>')
    .alias('exec')
    .description('Execute a workflow')
    .option('-i, --inputs <file>', 'Input variables JSON file')
    .option('-w, --watch', 'Watch execution in real-time')
    .action(async (workflowId, options) => {
      let inputs = {};

      if (options.inputs) {
        try {
          const content = readFileSync(options.inputs, 'utf-8');
          inputs = JSON.parse(content);
        } catch (err: any) {
          error(`Failed to read inputs file: ${err.message}`);
          process.exit(1);
        }
      }

      const spinner = ora('Starting workflow execution...').start();

      try {
        const client = createWorkflowClient();
        const data = await client.post<{ runId: string }>('/api/v1/runs', {
          workflowId,
          inputs,
        });

        spinner.stop();
        success(`Workflow execution started: ${data.runId}`);

        if (options.watch) {
          info('Watching execution...');
          await watchRun(data.runId);
        }
      } catch (err: any) {
        spinner.stop();
        error(`Failed to execute workflow: ${err.message}`);
        process.exit(1);
      }
    });

  // Watch run
  run
    .command('watch <id>')
    .description('Watch a workflow run in real-time')
    .action(async (id) => {
      info(`Watching run ${id}...`);
      await watchRun(id);
    });

  // Cancel run
  run
    .command('cancel <id>')
    .description('Cancel a running workflow')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (id, options) => {
      if (!options.yes) {
        const answers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: `Are you sure you want to cancel run ${id}?`,
            default: false,
          },
        ]);

        if (!answers.confirmed) {
          console.log('Canceled');
          return;
        }
      }

      const spinner = ora('Canceling run...').start();

      try {
        const client = createWorkflowClient();
        await client.post(`/api/v1/runs/${id}/cancel`, {});

        spinner.stop();
        success(`Run canceled: ${id}`);
      } catch (err: any) {
        spinner.stop();
        error(`Failed to cancel run: ${err.message}`);
        process.exit(1);
      }
    });

  // Resume run
  run
    .command('resume <id>')
    .description('Resume a failed or interrupted workflow run')
    .action(async (id) => {
      const spinner = ora('Resuming run...').start();

      try {
        const client = createWorkflowClient();
        await client.post(`/api/v1/runs/${id}/resume`, {});

        spinner.stop();
        success(`Run resumed: ${id}`);
      } catch (err: any) {
        spinner.stop();
        error(`Failed to resume run: ${err.message}`);
        process.exit(1);
      }
    });

  // Approve human node
  run
    .command('approve <runId> <nodeId>')
    .description('Approve a human-in-the-loop node')
    .option('-c, --comment <comment>', 'Approval comment')
    .action(async (runId, nodeId, options) => {
      const spinner = ora('Approving node...').start();

      try {
        const client = createWorkflowClient();
        await client.post(`/api/v1/runs/${runId}/approvals/${nodeId}/approve`, {
          approver: 'cli-user',
          comment: options.comment,
        });

        spinner.stop();
        success(`Node approved: ${nodeId}`);
      } catch (err: any) {
        spinner.stop();
        error(`Failed to approve node: ${err.message}`);
        process.exit(1);
      }
    });

  // Reject human node
  run
    .command('reject <runId> <nodeId>')
    .description('Reject a human-in-the-loop node')
    .option('-c, --comment <comment>', 'Rejection comment')
    .action(async (runId, nodeId, options) => {
      const spinner = ora('Rejecting node...').start();

      try {
        const client = createWorkflowClient();
        await client.post(`/api/v1/runs/${runId}/approvals/${nodeId}/reject`, {
          approver: 'cli-user',
          comment: options.comment,
        });

        spinner.stop();
        success(`Node rejected: ${nodeId}`);
      } catch (err: any) {
        spinner.stop();
        error(`Failed to reject node: ${err.message}`);
        process.exit(1);
      }
    });

  return run;
}

async function watchRun(runId: string): Promise<void> {
  const client = createWorkflowClient();

  try {
    await client.stream(`/api/v1/runs/${runId}/events`, (event) => {
      switch (event.type) {
        case 'node_started':
          info(`Node started: ${event.nodeId}`);
          break;
        case 'node_completed':
          success(`Node completed: ${event.nodeId}`);
          break;
        case 'node_failed':
          error(`Node failed: ${event.nodeId} - ${event.data?.error || 'Unknown error'}`);
          break;
        case 'workflow_completed':
          success('Workflow completed successfully');
          process.exit(0);
          break;
        case 'workflow_failed':
          error(`Workflow failed: ${event.data?.error || 'Unknown error'}`);
          process.exit(1);
          break;
        case 'waiting_approval':
          info(`Waiting for approval: ${event.nodeId}`);
          break;
      }
    });
  } catch (err: any) {
    error(`Failed to watch run: ${err.message}`);
    process.exit(1);
  }
}
