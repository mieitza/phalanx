# Phalanx CLI

Command-line interface for managing Phalanx workflows, runs, and MCP servers.

## Installation

```bash
pnpm install
pnpm build
```

## Usage

```bash
phalanx --help
```

## Commands

### Workflows

```bash
# List all workflows
phalanx workflow list

# Get workflow details
phalanx workflow get <id>

# Create workflow from JSON file
phalanx workflow create workflow.json

# Delete workflow
phalanx workflow delete <id>
```

### Workflow Runs

```bash
# List runs
phalanx run list

# List runs for specific workflow
phalanx run list --workflow <id>

# Get run details
phalanx run get <id>

# Execute workflow
phalanx run execute <workflowId>

# Execute with inputs
phalanx run execute <workflowId> --inputs inputs.json

# Execute and watch in real-time
phalanx run execute <workflowId> --watch

# Watch existing run
phalanx run watch <runId>

# Cancel run
phalanx run cancel <runId>

# Resume failed run
phalanx run resume <runId>

# Approve human-in-the-loop node
phalanx run approve <runId> <nodeId> --comment "Looks good"

# Reject human-in-the-loop node
phalanx run reject <runId> <nodeId> --comment "Needs changes"
```

### MCP Servers

```bash
# List registered servers
phalanx mcp list-servers

# Get server details
phalanx mcp get-server <id>

# Register new server
phalanx mcp register server.json

# Connect to server
phalanx mcp connect <id>

# Disconnect from server
phalanx mcp disconnect <id>

# Unregister server
phalanx mcp unregister <id>

# List all tools
phalanx mcp list-tools

# List tools for specific server
phalanx mcp list-tools --server <id>

# Get tool details
phalanx mcp get-tool <name>

# Call tool
phalanx mcp call <toolName> --args '{"query": "search term"}'

# Call tool on specific server
phalanx mcp call <toolName> --server <id> --args '{"query": "search term"}'
```

### Configuration

```bash
# Show configuration
phalanx config show

# Set configuration value
phalanx config set workflowServiceUrl http://localhost:3004

# Interactive setup
phalanx config setup

# Reset to defaults
phalanx config reset

# Show config file path
phalanx config path
```

## Configuration

The CLI stores configuration in `~/.phalanx/config.json`:

```json
{
  "workflowServiceUrl": "http://localhost:3004",
  "mcpServiceUrl": "http://localhost:3005",
  "apiGatewayUrl": "http://localhost:3000",
  "tenantId": "default",
  "defaultFormat": "table"
}
```

## Output Formats

Most commands support `--format` option:
- `table` (default): Pretty-printed tables
- `json`: Raw JSON output

## Examples

### Create and Execute Workflow

```bash
# Create workflow
phalanx workflow create my-workflow.json

# Execute with inputs
phalanx run execute <workflowId> --inputs inputs.json --watch
```

### Register and Use MCP Server

```bash
# Register MCP server
phalanx mcp register mcp-server.json

# Connect to it
phalanx mcp connect <serverId>

# List available tools
phalanx mcp list-tools

# Call a tool
phalanx mcp call search_web --args '{"query": "AI automation"}'
```

### Monitor Workflow Execution

```bash
# Watch run in real-time
phalanx run watch <runId>

# Check run status
phalanx run get <runId>

# List all running workflows
phalanx run list --status running
```

## Example Files

### workflow.json

```json
{
  "name": "My Workflow",
  "description": "Example workflow",
  "version": "1.0.0",
  "inputs": {
    "message": {
      "type": "string",
      "description": "Input message",
      "required": true
    }
  },
  "nodes": [
    {
      "id": "llm-1",
      "type": "llm",
      "config": {
        "model": "gpt-4",
        "messages": [
          {
            "role": "user",
            "content": "${variables.message}"
          }
        ]
      }
    }
  ]
}
```

### inputs.json

```json
{
  "message": "Hello, world!"
}
```

### mcp-server.json

```json
{
  "name": "My MCP Server",
  "description": "Example MCP server",
  "transport": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-example"]
  },
  "autoConnect": true
}
```
