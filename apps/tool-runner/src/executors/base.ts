import { ToolResult } from '@phalanx/schemas';
import EventEmitter from 'eventemitter3';

export interface ExecutionConfig {
  command: string;
  workingDir?: string;
  env?: Record<string, string>;
  timeout?: number;
  shell?: string;
}

export interface StreamEvent {
  type: 'stdout' | 'stderr' | 'exit' | 'error';
  data?: string;
  exitCode?: number;
  error?: Error;
}

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

export interface ExecutionState {
  id: string;
  status: ExecutionStatus;
  config: ExecutionConfig;
  startedAt?: Date;
  endedAt?: Date;
  exitCode?: number;
  error?: Error;
}

export abstract class Executor extends EventEmitter {
  abstract execute(config: ExecutionConfig): Promise<ToolResult>;
  abstract cancel(): Promise<void>;
  abstract getState(): ExecutionState;
}
