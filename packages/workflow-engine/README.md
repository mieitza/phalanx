# Workflow Engine

Event-driven workflow execution engine with DAG validation and parallel node execution.

## Features

- **DAG Validation**: Ensures workflows have no circular dependencies
- **Parallel Execution**: Concurrent node execution with configurable limits
- **Variable Resolution**: Reference outputs from previous nodes using `${outputs.nodeId.field}` syntax
- **Retry Logic**: Automatic retries with exponential backoff
- **Human-in-the-Loop**: Pause workflows for human approval
- **Event Streaming**: Real-time execution events
- **Type Safety**: Full TypeScript support

## Node Types

### LLM Node
Call language models via the LLM Gateway:

```typescript
{
  id: 'analyze',
  type: 'llm',
  config: {
    model: 'ollama/llama3.2',
    messages: [
      { role: 'user', content: 'Analyze this data: ${outputs.fetch.data}' }
    ],
    temperature: 0.7
  }
}
```

### Tool Node
Execute shell commands or Docker containers:

```typescript
{
  id: 'build',
  type: 'tool',
  config: {
    executor: 'shell',
    command: 'npm run build',
    workingDir: '/app',
    timeout: 300000
  }
}
```

### Human Node
Pause for human approval:

```typescript
{
  id: 'approve_deploy',
  type: 'human',
  config: {
    title: 'Approve Production Deployment',
    description: 'Review build artifacts before deploying to production',
    approvers: ['admin', 'devops-team'],
    timeoutMs: 3600000 // 1 hour
  }
}
```

## Usage Example

```typescript
import { WorkflowExecutor } from '@phalanx/workflow-engine';

const executor = new WorkflowExecutor({
  maxConcurrentNodes: 5,
  nodeTimeout: 300000,
});

// Listen for events
executor.on('event', (event) => {
  console.log(`${event.type}: ${event.nodeId}`);

  if (event.type === 'waiting_approval') {
    console.log('Workflow paused, waiting for approval...');
  }
});

// Execute workflow
await executor.execute(workflow, {
  runId: 'run-123',
  tenantId: 'tenant-1',
  variables: { environment: 'production' },
  outputs: new Map(),
});

// Approve a pending human node
executor.approve('run-123', 'approve_deploy', 'john@example.com', 'LGTM!');
```

## Event Types

- `node_started` - Node execution began
- `node_completed` - Node finished successfully
- `node_failed` - Node execution failed
- `waiting_approval` - Human node waiting for approval
- `workflow_completed` - Entire workflow finished
- `workflow_failed` - Workflow encountered an error

## Variable Resolution

Reference previous node outputs or workflow variables:

```typescript
// Reference another node's output
"Use the API key: ${outputs.fetch_config.apiKey}"

// Reference workflow variables
"Deploying to ${variables.environment}"

// Nested object access
"Status: ${outputs.api_call.response.status}"
```

## Error Handling

- **LLM Nodes**: 3 retry attempts with exponential backoff (1s, 2s, 4s)
- **Tool Nodes**: 2 retry attempts with exponential backoff (1s, 2s)
- **Human Nodes**: Optional timeout with auto-rejection
- **Failed Nodes**: Downstream nodes are skipped

## Cancellation

```typescript
// Cancel running workflow
executor.cancel();

// Cancellation:
// - Sets cancelRequested flag
// - Cancels all pending approvals
// - Running nodes complete their current execution
```
