import chalk from 'chalk';
import Table from 'cli-table3';
import { configManager } from '../config/index.js';

export type OutputFormat = 'json' | 'table';

export function output(data: any, format?: OutputFormat): void {
  const outputFormat = format || configManager.get().defaultFormat;

  if (outputFormat === 'json') {
    console.log(JSON.stringify(data, null, 2));
  } else {
    // Default to pretty printing
    console.log(data);
  }
}

export function outputTable(headers: string[], rows: string[][]): void {
  const table = new Table({
    head: headers.map(h => chalk.cyan(h)),
    style: {
      head: [],
      border: ['grey'],
    },
  });

  rows.forEach(row => table.push(row));
  console.log(table.toString());
}

export function success(message: string): void {
  console.log(chalk.green('✓'), message);
}

export function error(message: string): void {
  console.error(chalk.red('✗'), message);
}

export function warning(message: string): void {
  console.warn(chalk.yellow('⚠'), message);
}

export function info(message: string): void {
  console.log(chalk.blue('ℹ'), message);
}

export function formatStatus(status: string): string {
  switch (status) {
    case 'completed':
    case 'succeeded':
    case 'connected':
      return chalk.green(status);
    case 'failed':
    case 'error':
      return chalk.red(status);
    case 'running':
    case 'connecting':
      return chalk.blue(status);
    case 'pending':
    case 'waiting':
      return chalk.yellow(status);
    case 'canceled':
    case 'disconnected':
      return chalk.gray(status);
    default:
      return status;
  }
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString();
}

export function truncate(str: string, length: number = 50): string {
  if (str.length <= length) return str;
  return str.slice(0, length - 3) + '...';
}
