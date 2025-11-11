import { nanoid } from 'nanoid';
import type { Workflow } from '@phalanx/schemas';
import { WorkflowExecutor, WorkflowContext, ExecutionEvent } from '@phalanx/workflow-engine';
import { createDatabase, DatabaseInstance } from '@phalanx/database';
import { createLogger } from '@phalanx/shared';

const logger = createLogger({ name: 'workflow-manager' });

export interface RunMetadata {
  runId: string;
  workflowId: string;
  tenantId: string;
  status: 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export class WorkflowManager {
  private db: DatabaseInstance;
  private executors: Map<string, WorkflowExecutor> = new Map();
  private runMetadata: Map<string, RunMetadata> = new Map();

  constructor() {
    this.db = createDatabase();
  }

  /**
   * Create a new workflow
   */
  async createWorkflow(workflow: Workflow, tenantId: string): Promise<Workflow> {
    logger.info({ workflowId: workflow.id, tenantId }, 'Creating workflow');

    // Store workflow in database
    await this.db.db.insert(this.db.schema.workflows).values({
      id: workflow.id,
      tenantId,
      name: workflow.name || workflow.id,
      description: workflow.description,
      nodes: JSON.stringify(workflow.nodes),
      createdAt: new Date(),
    });

    return workflow;
  }

  /**
   * Get a workflow by ID
   */
  async getWorkflow(workflowId: string, tenantId: string): Promise<Workflow | null> {
    const [workflow] = await this.db.db
      .select()
      .from(this.db.schema.workflows)
      .where(
        this.db.schema.workflows.id.eq(workflowId).and(
          this.db.schema.workflows.tenantId.eq(tenantId)
        )
      )
      .limit(1);

    if (!workflow) {
      return null;
    }

    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description || undefined,
      nodes: JSON.parse(workflow.nodes as string),
    };
  }

  /**
   * Start a workflow run
   */
  async startRun(
    workflowId: string,
    tenantId: string,
    inputs?: Record<string, unknown>
  ): Promise<string> {
    const workflow = await this.getWorkflow(workflowId, tenantId);

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const runId = nanoid();

    logger.info({ runId, workflowId, tenantId }, 'Starting workflow run');

    // Create run metadata
    const metadata: RunMetadata = {
      runId,
      workflowId,
      tenantId,
      status: 'running',
      startedAt: new Date(),
    };

    this.runMetadata.set(runId, metadata);

    // Store run in database
    await this.db.db.insert(this.db.schema.runs).values({
      id: runId,
      workflowId,
      tenantId,
      status: 'running',
      inputs: inputs ? JSON.stringify(inputs) : null,
      startedAt: new Date(),
      createdAt: new Date(),
    });

    // Create executor
    const executor = new WorkflowExecutor({
      maxConcurrentNodes: 5,
      nodeTimeout: 300000,
    });

    this.executors.set(runId, executor);

    // Listen for events
    executor.on('event', (event) => this.handleEvent(runId, event));

    // Execute workflow asynchronously
    const context: WorkflowContext = {
      runId,
      tenantId,
      variables: inputs || {},
      outputs: new Map(),
    };

    // Execute in background
    executor
      .execute(workflow, context)
      .then(() => {
        logger.info({ runId }, 'Workflow completed successfully');
        this.updateRunStatus(runId, 'completed');
      })
      .catch((error) => {
        logger.error({ runId, error }, 'Workflow execution failed');
        this.updateRunStatus(runId, 'failed', error.message);
      });

    return runId;
  }

  /**
   * Get run status
   */
  getRunStatus(runId: string): RunMetadata | undefined {
    return this.runMetadata.get(runId);
  }

  /**
   * Cancel a running workflow
   */
  cancelRun(runId: string): boolean {
    const executor = this.executors.get(runId);

    if (!executor) {
      logger.warn({ runId }, 'No executor found for run');
      return false;
    }

    logger.info({ runId }, 'Cancelling workflow run');
    executor.cancel();
    this.updateRunStatus(runId, 'cancelled');

    return true;
  }

  /**
   * Approve a pending human node
   */
  approve(runId: string, nodeId: string, approver: string, comment?: string): boolean {
    const executor = this.executors.get(runId);

    if (!executor) {
      logger.warn({ runId, nodeId }, 'No executor found for approval');
      return false;
    }

    logger.info({ runId, nodeId, approver }, 'Approving node');
    return executor.approve(runId, nodeId, approver, comment);
  }

  /**
   * Reject a pending human node
   */
  reject(runId: string, nodeId: string, approver: string, comment?: string): boolean {
    const executor = this.executors.get(runId);

    if (!executor) {
      logger.warn({ runId, nodeId }, 'No executor found for rejection');
      return false;
    }

    logger.info({ runId, nodeId, approver }, 'Rejecting node');
    return executor.reject(runId, nodeId, approver, comment);
  }

  /**
   * Get pending approvals for a run
   */
  getPendingApprovals(runId: string): string[] {
    const executor = this.executors.get(runId);

    if (!executor) {
      return [];
    }

    return executor.getPendingApprovals().filter(key => key.startsWith(`${runId}:`));
  }

  /**
   * Subscribe to workflow events
   */
  subscribeToRun(runId: string, callback: (event: ExecutionEvent) => void): () => void {
    const executor = this.executors.get(runId);

    if (!executor) {
      throw new Error(`Run ${runId} not found`);
    }

    executor.on('event', callback);

    // Return unsubscribe function
    return () => {
      executor.off('event', callback);
    };
  }

  private async handleEvent(runId: string, event: ExecutionEvent): Promise<void> {
    logger.info({ runId, eventType: event.type, nodeId: event.nodeId }, 'Workflow event');

    const metadata = this.runMetadata.get(runId);

    if (!metadata) {
      return;
    }

    // Update status based on event
    if (event.type === 'waiting_approval') {
      metadata.status = 'waiting';
      this.runMetadata.set(runId, metadata);
    }

    // Store event in database (optional - could be for audit trail)
    // await this.db.db.insert(this.db.schema.runEvents).values({ ... });
  }

  private async updateRunStatus(
    runId: string,
    status: RunMetadata['status'],
    error?: string
  ): Promise<void> {
    const metadata = this.runMetadata.get(runId);

    if (!metadata) {
      return;
    }

    metadata.status = status;
    metadata.error = error;

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      metadata.completedAt = new Date();
    }

    this.runMetadata.set(runId, metadata);

    // Update database
    await this.db.db
      .update(this.db.schema.runs)
      .set({
        status,
        endedAt: metadata.completedAt,
      })
      .where(this.db.schema.runs.id.eq(runId));
  }
}
