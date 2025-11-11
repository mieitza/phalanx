import EventEmitter from 'eventemitter3';
import type { Workflow, WorkflowNode, Run } from '@phalanx/schemas';
import type {
  WorkflowContext,
  NodeExecutionResult,
  ExecutionEvent,
  WorkflowEngineConfig,
} from '../types';
import { DAGValidator } from '../validators/dag';
import { NodeExecutor } from '../executors/base';
import { LLMNodeExecutor } from '../executors/llm';
import { ToolNodeExecutor } from '../executors/tool';
import { HumanNodeExecutor } from '../executors/human';
import { createLogger } from '@phalanx/shared';

const logger = createLogger({ name: 'workflow-executor' });

export class WorkflowExecutor extends EventEmitter<{
  event: (event: ExecutionEvent) => void;
}> {
  private executors: Map<string, NodeExecutor> = new Map();
  private runningNodes: Set<string> = new Set();
  private completedNodes: Set<string> = new Set();
  private failedNodes: Set<string> = new Set();
  private cancelRequested = false;
  private humanExecutor: HumanNodeExecutor;

  constructor(private config: WorkflowEngineConfig = {}) {
    super();

    // Register default node executors
    this.registerExecutor(new LLMNodeExecutor());
    this.registerExecutor(new ToolNodeExecutor());

    // Human executor is special - we keep a reference for approval handling
    this.humanExecutor = new HumanNodeExecutor();
    this.registerExecutor(this.humanExecutor);
  }

  registerExecutor(executor: NodeExecutor): void {
    this.executors.set(executor.type, executor);
    logger.info({ type: executor.type }, 'Registered node executor');
  }

  async execute(workflow: Workflow, context: WorkflowContext): Promise<void> {
    logger.info({ runId: context.runId, workflowId: workflow.id }, 'Starting workflow execution');

    // Reset state
    this.runningNodes.clear();
    this.completedNodes.clear();
    this.failedNodes.clear();
    this.cancelRequested = false;

    // Validate workflow DAG
    try {
      DAGValidator.validate(workflow);
    } catch (error) {
      logger.error({ error }, 'Workflow validation failed');
      this.emitEvent({
        type: 'workflow_failed',
        runId: context.runId,
        timestamp: new Date(),
        data: { error: (error as Error).message },
      });
      throw error;
    }

    // Execute workflow
    try {
      await this.executeWorkflow(workflow, context);

      if (!this.cancelRequested) {
        logger.info({ runId: context.runId }, 'Workflow completed successfully');
        this.emitEvent({
          type: 'workflow_completed',
          runId: context.runId,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      logger.error({ runId: context.runId, error }, 'Workflow execution failed');
      this.emitEvent({
        type: 'workflow_failed',
        runId: context.runId,
        timestamp: new Date(),
        data: { error: (error as Error).message },
      });
      throw error;
    }
  }

  private async executeWorkflow(workflow: Workflow, context: WorkflowContext): Promise<void> {
    const maxConcurrent = this.config.maxConcurrentNodes || 5;

    while (this.completedNodes.size < workflow.nodes.length && !this.cancelRequested) {
      // Get nodes that can be executed (dependencies met)
      const executableNodes = DAGValidator.getExecutableNodes(workflow, this.completedNodes);

      // Filter out already running/failed nodes
      const nodesToExecute = executableNodes.filter(
        nodeId => !this.runningNodes.has(nodeId) && !this.failedNodes.has(nodeId)
      );

      if (nodesToExecute.length === 0) {
        // No more nodes can execute - either all done or waiting
        if (this.runningNodes.size === 0) {
          // Nothing running and nothing executable means we're stuck
          // This could happen with failed dependencies
          break;
        }

        // Wait for running nodes to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      // Execute nodes up to concurrency limit
      const nodesToStart = nodesToExecute.slice(0, maxConcurrent - this.runningNodes.size);

      await Promise.all(
        nodesToStart.map(nodeId => {
          const node = workflow.nodes.find(n => n.id === nodeId);
          if (!node) return Promise.resolve();

          return this.executeNode(node, context);
        })
      );
    }

    // Wait for all running nodes to complete
    while (this.runningNodes.size > 0 && !this.cancelRequested) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  private async executeNode(node: WorkflowNode, context: WorkflowContext): Promise<void> {
    const executor = this.executors.get(node.type);

    if (!executor) {
      logger.error({ nodeId: node.id, type: node.type }, 'No executor found for node type');
      this.failedNodes.add(node.id);
      return;
    }

    this.runningNodes.add(node.id);

    this.emitEvent({
      type: 'node_started',
      runId: context.runId,
      nodeId: node.id,
      timestamp: new Date(),
    });

    // Emit waiting_approval event for human nodes
    if (node.type === 'human') {
      this.emitEvent({
        type: 'waiting_approval',
        runId: context.runId,
        nodeId: node.id,
        timestamp: new Date(),
        data: node.config,
      });
    }

    logger.info({ nodeId: node.id, type: node.type }, 'Executing node');

    const startedAt = new Date();

    try {
      const result = await executor.execute(node, context);

      if (result.error) {
        throw result.error;
      }

      // Store output in context
      context.outputs.set(node.id, result.output);

      this.runningNodes.delete(node.id);
      this.completedNodes.add(node.id);

      const completedAt = new Date();

      // Persist node state
      if (this.config.persistenceCallback) {
        await this.config.persistenceCallback({
          nodeId: node.id,
          status: 'completed',
          output: result.output,
          startedAt,
          completedAt,
        }).catch(err => {
          logger.error({ nodeId: node.id, err }, 'Failed to persist node state');
        });
      }

      this.emitEvent({
        type: 'node_completed',
        runId: context.runId,
        nodeId: node.id,
        timestamp: completedAt,
        data: result.output,
      });

      logger.info({ nodeId: node.id }, 'Node completed successfully');
    } catch (error) {
      this.runningNodes.delete(node.id);
      this.failedNodes.add(node.id);

      const completedAt = new Date();

      // Persist node failure
      if (this.config.persistenceCallback) {
        await this.config.persistenceCallback({
          nodeId: node.id,
          status: 'failed',
          error: (error as Error).message,
          startedAt,
          completedAt,
        }).catch(err => {
          logger.error({ nodeId: node.id, err }, 'Failed to persist node failure');
        });
      }

      this.emitEvent({
        type: 'node_failed',
        runId: context.runId,
        nodeId: node.id,
        timestamp: completedAt,
        data: { error: (error as Error).message },
      });

      logger.error({ nodeId: node.id, error }, 'Node execution failed');
    }
  }

  /**
   * Resume workflow execution from saved state
   */
  async resume(
    workflow: Workflow,
    context: WorkflowContext,
    completedNodeIds: string[]
  ): Promise<void> {
    logger.info(
      { runId: context.runId, completedNodes: completedNodeIds.length },
      'Resuming workflow execution'
    );

    // Restore completed nodes state
    this.completedNodes = new Set(completedNodeIds);
    this.runningNodes.clear();
    this.failedNodes.clear();
    this.cancelRequested = false;

    // Validate workflow DAG
    try {
      DAGValidator.validate(workflow);
    } catch (error) {
      logger.error({ error }, 'Workflow validation failed');
      this.emitEvent({
        type: 'workflow_failed',
        runId: context.runId,
        timestamp: new Date(),
        data: { error: (error as Error).message },
      });
      throw error;
    }

    // Resume execution
    try {
      await this.executeWorkflow(workflow, context);

      if (!this.cancelRequested) {
        logger.info({ runId: context.runId }, 'Workflow resumed and completed successfully');
        this.emitEvent({
          type: 'workflow_completed',
          runId: context.runId,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      logger.error({ runId: context.runId, error }, 'Workflow execution failed after resume');
      this.emitEvent({
        type: 'workflow_failed',
        runId: context.runId,
        timestamp: new Date(),
        data: { error: (error as Error).message },
      });
      throw error;
    }
  }

  /**
   * Get current execution state
   */
  getState(): {
    completedNodes: string[];
    runningNodes: string[];
    failedNodes: string[];
  } {
    return {
      completedNodes: Array.from(this.completedNodes),
      runningNodes: Array.from(this.runningNodes),
      failedNodes: Array.from(this.failedNodes),
    };
  }

  /**
   * Approve a pending human-in-the-loop node
   */
  approve(runId: string, nodeId: string, approver: string, comment?: string): boolean {
    return this.humanExecutor.approve(runId, nodeId, approver, comment);
  }

  /**
   * Reject a pending human-in-the-loop node
   */
  reject(runId: string, nodeId: string, approver: string, comment?: string): boolean {
    return this.humanExecutor.reject(runId, nodeId, approver, comment);
  }

  /**
   * Get all pending approval requests
   */
  getPendingApprovals(): string[] {
    return this.humanExecutor.getPendingApprovals();
  }

  /**
   * Check if a specific approval is pending
   */
  isApprovalPending(runId: string, nodeId: string): boolean {
    return this.humanExecutor.isPending(runId, nodeId);
  }

  /**
   * Cancel workflow execution
   */
  cancel(): void {
    this.cancelRequested = true;

    // Cancel all pending approvals
    const pending = this.humanExecutor.getPendingApprovals();
    for (const key of pending) {
      const [runId, nodeId] = key.split(':');
      this.humanExecutor.cancel(runId, nodeId);
    }

    logger.info('Workflow cancellation requested');
  }

  private emitEvent(event: ExecutionEvent): void {
    this.emit('event', event);
  }
}
