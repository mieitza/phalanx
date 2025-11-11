// Engine
export { WorkflowExecutor } from './engine/executor';

// Executors
export { NodeExecutor } from './executors/base';
export { LLMNodeExecutor } from './executors/llm';
export { ToolNodeExecutor } from './executors/tool';
export { HumanNodeExecutor } from './executors/human';
export type {
  HumanNodeConfig,
  ApprovalRequest,
  ApprovalResponse,
} from './executors/human';

// Validators
export { DAGValidator, DAGValidationError } from './validators/dag';

// Types
export type {
  WorkflowContext,
  SerializedContext,
  NodeExecutionResult,
  ExecutionEvent,
  WorkflowEngineConfig,
  WorkflowNodeType,
  WorkflowNodeStatus,
  NodeStateUpdate,
} from './types';

// Utility functions
export function serializeContext(context: WorkflowContext): SerializedContext {
  return {
    runId: context.runId,
    tenantId: context.tenantId,
    variables: context.variables,
    outputs: Object.fromEntries(context.outputs),
  };
}

export function deserializeContext(serialized: SerializedContext): WorkflowContext {
  return {
    runId: serialized.runId,
    tenantId: serialized.tenantId,
    variables: serialized.variables,
    outputs: new Map(Object.entries(serialized.outputs)),
  };
}
