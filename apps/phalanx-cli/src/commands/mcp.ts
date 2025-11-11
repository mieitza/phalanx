import { Command } from 'commander';
import ora from 'ora';
import inquirer from 'inquirer';
import { readFileSync } from 'fs';
import { createMCPClient } from '../utils/api.js';
import { output, outputTable, success, error, formatStatus, formatDate, truncate } from '../utils/output.js';

export function createMCPCommand(): Command {
  const mcp = new Command('mcp')
    .description('Manage MCP servers and tools');

  // List servers
  mcp
    .command('list-servers')
    .alias('ls')
    .description('List registered MCP servers')
    .option('-f, --format <format>', 'Output format (json|table)', 'table')
    .action(async (options) => {
      const spinner = ora('Loading MCP servers...').start();

      try {
        const client = createMCPClient();
        const data = await client.get<{ servers: any[] }>('/api/v1/servers');

        spinner.stop();

        if (options.format === 'json') {
          output(data.servers, 'json');
        } else {
          if (data.servers.length === 0) {
            console.log('No MCP servers registered');
            return;
          }

          outputTable(
            ['ID', 'Name', 'Transport', 'Status', 'Tools'],
            data.servers.map(s => [
              truncate(s.id, 20),
              truncate(s.name, 30),
              s.transport.type,
              formatStatus(s.status),
              String(s.tools?.length || 0),
            ])
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(`Failed to list servers: ${err.message}`);
        process.exit(1);
      }
    });

  // Get server details
  mcp
    .command('get-server <id>')
    .description('Get MCP server details')
    .option('-f, --format <format>', 'Output format (json|table)', 'json')
    .action(async (id, options) => {
      const spinner = ora('Loading server...').start();

      try {
        const client = createMCPClient();
        const data = await client.get(`/api/v1/servers/${id}`);

        spinner.stop();
        output(data, options.format);
      } catch (err: any) {
        spinner.stop();
        error(`Failed to get server: ${err.message}`);
        process.exit(1);
      }
    });

  // Register server
  mcp
    .command('register <file>')
    .description('Register a new MCP server from JSON file')
    .action(async (file) => {
      const spinner = ora('Registering server...').start();

      try {
        const content = readFileSync(file, 'utf-8');
        const serverData = JSON.parse(content);

        const client = createMCPClient();
        const data = await client.post('/api/v1/servers', serverData);

        spinner.stop();
        success(`Server registered: ${(data as any).id}`);
        output(data, 'json');
      } catch (err: any) {
        spinner.stop();
        error(`Failed to register server: ${err.message}`);
        process.exit(1);
      }
    });

  // Connect to server
  mcp
    .command('connect <id>')
    .description('Connect to an MCP server')
    .action(async (id) => {
      const spinner = ora('Connecting to server...').start();

      try {
        const client = createMCPClient();
        await client.post(`/api/v1/servers/${id}/connect`, {});

        spinner.stop();
        success(`Connected to server: ${id}`);
      } catch (err: any) {
        spinner.stop();
        error(`Failed to connect: ${err.message}`);
        process.exit(1);
      }
    });

  // Disconnect from server
  mcp
    .command('disconnect <id>')
    .description('Disconnect from an MCP server')
    .action(async (id) => {
      const spinner = ora('Disconnecting from server...').start();

      try {
        const client = createMCPClient();
        await client.post(`/api/v1/servers/${id}/disconnect`, {});

        spinner.stop();
        success(`Disconnected from server: ${id}`);
      } catch (err: any) {
        spinner.stop();
        error(`Failed to disconnect: ${err.message}`);
        process.exit(1);
      }
    });

  // Unregister server
  mcp
    .command('unregister <id>')
    .description('Unregister an MCP server')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (id, options) => {
      if (!options.yes) {
        const answers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: `Are you sure you want to unregister server ${id}?`,
            default: false,
          },
        ]);

        if (!answers.confirmed) {
          console.log('Canceled');
          return;
        }
      }

      const spinner = ora('Unregistering server...').start();

      try {
        const client = createMCPClient();
        await client.delete(`/api/v1/servers/${id}`);

        spinner.stop();
        success(`Server unregistered: ${id}`);
      } catch (err: any) {
        spinner.stop();
        error(`Failed to unregister server: ${err.message}`);
        process.exit(1);
      }
    });

  // List tools
  mcp
    .command('list-tools')
    .alias('tools')
    .description('List all available MCP tools')
    .option('-s, --server <id>', 'Filter by server ID')
    .option('-f, --format <format>', 'Output format (json|table)', 'table')
    .action(async (options) => {
      const spinner = ora('Loading tools...').start();

      try {
        const client = createMCPClient();
        const path = options.server
          ? `/api/v1/servers/${options.server}/tools`
          : '/api/v1/tools';

        const data = await client.get<{ tools: any[] }>(path);

        spinner.stop();

        if (options.format === 'json') {
          output(data.tools, 'json');
        } else {
          if (data.tools.length === 0) {
            console.log('No tools available');
            return;
          }

          outputTable(
            ['Tool Name', 'Server', 'Description'],
            data.tools.map(t => [
              t.tool.name,
              truncate(t.serverName || 'N/A', 20),
              truncate(t.tool.description || '', 40),
            ])
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(`Failed to list tools: ${err.message}`);
        process.exit(1);
      }
    });

  // Get tool details
  mcp
    .command('get-tool <name>')
    .description('Get tool details')
    .option('-f, --format <format>', 'Output format (json|table)', 'json')
    .action(async (name, options) => {
      const spinner = ora('Loading tool...').start();

      try {
        const client = createMCPClient();
        const data = await client.get(`/api/v1/tools/${name}`);

        spinner.stop();
        output(data, options.format);
      } catch (err: any) {
        spinner.stop();
        error(`Failed to get tool: ${err.message}`);
        process.exit(1);
      }
    });

  // Call tool
  mcp
    .command('call <toolName>')
    .description('Call an MCP tool')
    .option('-a, --args <json>', 'Tool arguments as JSON string')
    .option('-s, --server <id>', 'Server ID (optional - will auto-discover)')
    .action(async (toolName, options) => {
      let args = {};

      if (options.args) {
        try {
          args = JSON.parse(options.args);
        } catch (err: any) {
          error(`Invalid JSON arguments: ${err.message}`);
          process.exit(1);
        }
      }

      const spinner = ora('Calling tool...').start();

      try {
        const client = createMCPClient();
        const data = await client.post('/api/v1/tools/call', {
          name: toolName,
          arguments: args,
          serverId: options.server,
        });

        spinner.stop();
        success('Tool executed successfully');
        output(data, 'json');
      } catch (err: any) {
        spinner.stop();
        error(`Failed to call tool: ${err.message}`);
        process.exit(1);
      }
    });

  return mcp;
}
