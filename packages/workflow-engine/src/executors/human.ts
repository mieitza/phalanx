import type { WorkflowNode } from '@phalanx/schemas';
import type { WorkflowContext, NodeExecutionResult } from '../types';
import { NodeExecutor } from './base';
import { createLogger } from '@phalanx/shared';

const logger = createLogger({ name: 'human-executor' });

export interface HumanNodeConfig {
  title: string;
  description: string;
  approvers?: string[]; // User IDs or roles that can approve
  timeoutMs?: number; // Auto-reject after timeout
  data?: Record<string, unknown>; // Additional context for approver
}

export interface ApprovalRequest {
  runId: string;
  nodeId: string;
  config: HumanNodeConfig;
  createdAt: Date;
  expiresAt?: Date;
}

export interface ApprovalResponse {
  approved: boolean;
  approver: string;
  comment?: string;
  approvedAt: Date;
}

/**
 * Human-in-the-loop executor
 * Pauses workflow execution and waits for human approval
 */
export class HumanNodeExecutor extends NodeExecutor {
  readonly type = 'human';

  private pendingApprovals = new Map<string, {
    resolve: (response: ApprovalResponse) => void;
    reject: (error: Error) => void;
    timeout?: NodeJS.Timeout;
  }>();

  async execute(
    node: WorkflowNode,
    context: WorkflowContext
  ): Promise<NodeExecutionResult> {
    const config = node.config as unknown as HumanNodeConfig;

    if (!config.title) {
      return {
        output: null,
        error: new Error('Human node missing required "title" field'),
      };
    }

    logger.info(
      { nodeId: node.id, runId: context.runId, title: config.title },
      'Human approval required'
    );

    const approvalKey = `${context.runId}:${node.id}`;

    try {
      // Wait for approval
      const response = await new Promise<ApprovalResponse>((resolve, reject) => {
        // Store promise handlers
        const handlers: any = { resolve, reject };

        // Set timeout if configured
        if (config.timeoutMs) {
          handlers.timeout = setTimeout(() => {
            this.pendingApprovals.delete(approvalKey);
            reject(new Error(`Approval timeout after ${config.timeoutMs}ms`));
          }, config.timeoutMs);
        }

        this.pendingApprovals.set(approvalKey, handlers);
      });

      if (!response.approved) {
        logger.info(
          { nodeId: node.id, runId: context.runId, approver: response.approver },
          'Approval rejected'
        );

        return {
          output: null,
          error: new Error(`Approval rejected by ${response.approver}: ${response.comment || 'No comment'}`),
        };
      }

      logger.info(
        { nodeId: node.id, runId: context.runId, approver: response.approver },
        'Approval granted'
      );

      return {
        output: {
          approved: true,
          approver: response.approver,
          comment: response.comment,
          approvedAt: response.approvedAt,
        },
        metadata: {
          approver: response.approver,
        },
      };
    } catch (error) {
      logger.error({ nodeId: node.id, runId: context.runId, error }, 'Approval failed');
      throw error;
    }
  }

  /**
   * Approve a pending request
   */
  approve(runId: string, nodeId: string, approver: string, comment?: string): boolean {
    const approvalKey = `${runId}:${nodeId}`;
    const pending = this.pendingApprovals.get(approvalKey);

    if (!pending) {
      logger.warn({ runId, nodeId }, 'No pending approval found');
      return false;
    }

    // Clear timeout
    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    // Resolve the promise
    pending.resolve({
      approved: true,
      approver,
      comment,
      approvedAt: new Date(),
    });

    this.pendingApprovals.delete(approvalKey);

    logger.info({ runId, nodeId, approver }, 'Approval granted');
    return true;
  }

  /**
   * Reject a pending request
   */
  reject(runId: string, nodeId: string, approver: string, comment?: string): boolean {
    const approvalKey = `${runId}:${nodeId}`;
    const pending = this.pendingApprovals.get(approvalKey);

    if (!pending) {
      logger.warn({ runId, nodeId }, 'No pending approval found');
      return false;
    }

    // Clear timeout
    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    // Resolve with rejection
    pending.resolve({
      approved: false,
      approver,
      comment,
      approvedAt: new Date(),
    });

    this.pendingApprovals.delete(approvalKey);

    logger.info({ runId, nodeId, approver }, 'Approval rejected');
    return true;
  }

  /**
   * Get all pending approvals
   */
  getPendingApprovals(): string[] {
    return Array.from(this.pendingApprovals.keys());
  }

  /**
   * Check if a specific approval is pending
   */
  isPending(runId: string, nodeId: string): boolean {
    const approvalKey = `${runId}:${nodeId}`;
    return this.pendingApprovals.has(approvalKey);
  }

  /**
   * Cancel a pending approval
   */
  cancel(runId: string, nodeId: string): boolean {
    const approvalKey = `${runId}:${nodeId}`;
    const pending = this.pendingApprovals.get(approvalKey);

    if (!pending) {
      return false;
    }

    // Clear timeout
    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    // Reject with cancellation error
    pending.reject(new Error('Approval cancelled'));

    this.pendingApprovals.delete(approvalKey);

    logger.info({ runId, nodeId }, 'Approval cancelled');
    return true;
  }
}
