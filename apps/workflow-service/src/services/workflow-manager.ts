import { nanoid } from 'nanoid';
import type { Workflow } from '@phalanx/schemas';
import {
  WorkflowExecutor,
  WorkflowContext,
  ExecutionEvent,
  NodeStateUpdate,
  serializeContext,
  deserializeContext,
} from '@phalanx/workflow-engine';
import { createDatabase, DatabaseInstance, schema } from '@phalanx/database';
import { createLogger } from '@phalanx/shared';
import { eq, and } from 'drizzle-orm';

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
    // Auto-recover interrupted workflows on startup
    this.recoverInterruptedRuns().catch(err => {
      logger.error({ err }, 'Failed to recover interrupted runs');
    });
  }

  /**
   * Create a new workflow
   */
  async createWorkflow(workflow: Workflow, tenantId: string): Promise<Workflow> {
    logger.info({ workflowId: workflow.id, tenantId }, 'Creating workflow');

    // Store workflow in database
    await this.db.db.insert(schema.workflows).values({
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
      .from(schema.workflows)
      .where(
        schema.workflows.id.eq(workflowId).and(
          schema.workflows.tenantId.eq(tenantId)
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
    await this.db.db.insert(schema.runs).values({
      id: runId,
      workflowId,
      tenantId,
      status: 'running',
      inputs: inputs ? JSON.stringify(inputs) : null,
      startedAt: new Date(),
      createdAt: new Date(),
    });

    // Create executor with persistence callback
    const executor = new WorkflowExecutor({
      maxConcurrentNodes: 5,
      nodeTimeout: 300000,
      persistenceCallback: async (update) => {
        await this.persistNodeState(runId, update);
      },
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
    // await this.db.db.insert(schema.runEvents).values({ ... });
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
      .update(schema.runs)
      .set({
        status,
        endedAt: metadata.completedAt,
      })
      .where(eq(schema.runs.id, runId));
  }

  /**
   * Persist node execution state to database
   */
  private async persistNodeState(runId: string, update: NodeStateUpdate): Promise<void> {
    logger.info({ runId, nodeId: update.nodeId, status: update.status }, 'Persisting node state');

    try {
      // Check if node record exists
      const existing = await this.db.db
        .select()
        .from(schema.runNodes)
        .where(
          and(
            eq(schema.runNodes.runId, runId),
            eq(schema.runNodes.nodeId, update.nodeId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Update existing record
        await this.db.db
          .update(schema.runNodes)
          .set({
            status: update.status,
            output: update.output ? JSON.stringify(update.output) : null,
            error: update.error,
            completedAt: update.completedAt,
          })
          .where(
            and(
              eq(schema.runNodes.runId, runId),
              eq(schema.runNodes.nodeId, update.nodeId)
            )
          );
      } else {
        // Insert new record
        await this.db.db.insert(schema.runNodes).values({
          id: nanoid(),
          runId,
          nodeId: update.nodeId,
          status: update.status,
          output: update.output ? JSON.stringify(update.output) : null,
          error: update.error,
          startedAt: update.startedAt,
          completedAt: update.completedAt,
          createdAt: new Date(),
        });
      }
    } catch (error) {
      logger.error({ runId, nodeId: update.nodeId, error }, 'Failed to persist node state');
      throw error;
    }
  }

  /**
   * Recover interrupted workflow runs
   */
  private async recoverInterruptedRuns(): Promise<void> {
    logger.info('Checking for interrupted workflow runs...');

    try {
      // Find runs that were running or waiting when service stopped
      const interruptedRuns = await this.db.db
        .select()
        .from(schema.runs)
        .where(
          schema.runs.status.in(['running', 'waiting'])
        );

      if (interruptedRuns.length === 0) {
        logger.info('No interrupted runs found');
        return;
      }

      logger.info({ count: interruptedRuns.length }, 'Found interrupted runs, recovering...');

      for (const run of interruptedRuns) {
        try {
          await this.resumeRun(run.id);
        } catch (error) {
          logger.error({ runId: run.id, error }, 'Failed to resume run');
          // Mark as failed
          await this.db.db
            .update(schema.runs)
            .set({
              status: 'failed',
              endedAt: new Date(),
            })
            .where(eq(schema.runs.id, run.id));
        }
      }

      logger.info({ count: interruptedRuns.length }, 'Recovery complete');
    } catch (error) {
      logger.error({ error }, 'Failed to recover interrupted runs');
      throw error;
    }
  }

  /**
   * Resume a workflow run from saved state
   */
  async resumeRun(runId: string): Promise<void> {
    logger.info({ runId }, 'Resuming workflow run');

    // Get run from database
    const [run] = await this.db.db
      .select()
      .from(schema.runs)
      .where(eq(schema.runs.id, runId))
      .limit(1);

    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    // Get workflow
    const workflow = await this.getWorkflow(run.workflowId, run.tenantId);

    if (!workflow) {
      throw new Error(`Workflow ${run.workflowId} not found`);
    }

    // Get completed nodes
    const runNodes = await this.db.db
      .select()
      .from(schema.runNodes)
      .where(eq(schema.runNodes.runId, runId));

    const completedNodeIds = runNodes
      .filter(n => n.status === 'completed')
      .map(n => n.nodeId);

    // Reconstruct context with saved outputs
    const context: WorkflowContext = {
      runId,
      tenantId: run.tenantId,
      variables: run.inputs ? JSON.parse(run.inputs as string) : {},
      outputs: new Map(
        runNodes
          .filter(n => n.status === 'completed' && n.output)
          .map(n => [n.nodeId, JSON.parse(n.output as string)])
      ),
    };

    // Update run status
    await this.db.db
      .update(schema.runs)
      .set({ status: 'running' })
      .where(eq(schema.runs.id, runId));

    // Create metadata
    const metadata: RunMetadata = {
      runId,
      workflowId: run.workflowId,
      tenantId: run.tenantId,
      status: 'running',
      startedAt: run.startedAt || new Date(),
    };

    this.runMetadata.set(runId, metadata);

    // Create new executor with persistence
    const executor = new WorkflowExecutor({
      maxConcurrentNodes: 5,
      nodeTimeout: 300000,
      persistenceCallback: async (update) => {
        await this.persistNodeState(runId, update);
      },
    });

    this.executors.set(runId, executor);

    // Listen for events
    executor.on('event', (event) => this.handleEvent(runId, event));

    // Resume execution
    executor
      .resume(workflow, context, completedNodeIds)
      .then(() => {
        logger.info({ runId }, 'Workflow resumed and completed');
        this.updateRunStatus(runId, 'completed');
      })
      .catch((error) => {
        logger.error({ runId, error }, 'Workflow failed after resume');
        this.updateRunStatus(runId, 'failed', error.message);
      });
  }
}
