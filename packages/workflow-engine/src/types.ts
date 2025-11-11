import type { Run, RunNode } from '@phalanx/schemas';

export type WorkflowNodeType = 'llm' | 'tool' | 'human' | 'conditional';

export type WorkflowNodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'waiting' | 'skipped';

export interface WorkflowContext {
  runId: string;
  tenantId: string;
  variables: Record<string, unknown>;
  outputs: Map<string, unknown>;
}

export interface SerializedContext {
  runId: string;
  tenantId: string;
  variables: Record<string, unknown>;
  outputs: Record<string, unknown>;
}

export interface NodeExecutionResult {
  output: unknown;
  error?: Error;
  metadata?: Record<string, unknown>;
}

export interface ExecutionEvent {
  type: 'node_started' | 'node_completed' | 'node_failed' | 'workflow_completed' | 'workflow_failed' | 'waiting_approval';
  runId: string;
  nodeId?: string;
  timestamp: Date;
  data?: unknown;
}

export interface NodeStateUpdate {
  nodeId: string;
  status: WorkflowNodeStatus;
  output?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface WorkflowEngineConfig {
  maxConcurrentNodes?: number;
  nodeTimeout?: number;
  enableRetries?: boolean;
  maxRetries?: number;
  persistenceCallback?: (update: NodeStateUpdate) => Promise<void>;
}
