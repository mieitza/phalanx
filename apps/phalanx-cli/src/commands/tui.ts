import { Command } from 'commander';
import { startDashboard } from '../tui/dashboard.js';
import { startRunMonitor } from '../tui/run-monitor.js';

export function createTUICommand(): Command {
  const tui = new Command('tui')
    .description('Launch interactive Terminal UI');

  // Dashboard
  tui
    .command('dashboard')
    .alias('dash')
    .description('Launch the workflow monitoring dashboard')
    .action(() => {
      startDashboard();
    });

  // Monitor specific run
  tui
    .command('monitor <runId>')
    .alias('mon')
    .description('Monitor a specific workflow run')
    .action((runId: string) => {
      startRunMonitor(runId);
    });

  return tui;
}
