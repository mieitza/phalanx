import type { Workflow } from '@phalanx/schemas';

export class DAGValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DAGValidationError';
  }
}

export class DAGValidator {
  /**
   * Validates that a workflow forms a valid Directed Acyclic Graph (DAG)
   * @throws {DAGValidationError} if the workflow has cycles or invalid dependencies
   */
  static validate(workflow: Workflow): void {
    const nodeIds = new Set(workflow.nodes.map(n => n.id));

    // Validate that all nodes exist
    for (const node of workflow.nodes) {
      for (const depId of node.dependencies || []) {
        if (!nodeIds.has(depId)) {
          throw new DAGValidationError(
            `Node "${node.id}" depends on non-existent node "${depId}"`
          );
        }
      }
    }

    // Check for cycles using DFS
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = workflow.nodes.find(n => n.id === nodeId);
      if (!node) return false;

      for (const depId of node.dependencies || []) {
        if (!visited.has(depId)) {
          if (hasCycle(depId)) {
            return true;
          }
        } else if (recursionStack.has(depId)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of workflow.nodes) {
      if (!visited.has(node.id)) {
        if (hasCycle(node.id)) {
          throw new DAGValidationError(
            `Workflow contains a cycle involving node "${node.id}"`
          );
        }
      }
    }
  }

  /**
   * Returns a topologically sorted list of node IDs
   * Nodes with no dependencies come first
   */
  static topologicalSort(workflow: Workflow): string[] {
    this.validate(workflow);

    const sorted: string[] = [];
    const visited = new Set<string>();

    const visit = (nodeId: string): void => {
      if (visited.has(nodeId)) return;

      const node = workflow.nodes.find(n => n.id === nodeId);
      if (!node) return;

      // Visit all dependencies first
      for (const depId of node.dependencies || []) {
        visit(depId);
      }

      visited.add(nodeId);
      sorted.push(nodeId);
    };

    for (const node of workflow.nodes) {
      visit(node.id);
    }

    return sorted;
  }

  /**
   * Returns nodes that have no unmet dependencies and can be executed
   */
  static getExecutableNodes(
    workflow: Workflow,
    completedNodeIds: Set<string>
  ): string[] {
    return workflow.nodes
      .filter(node => {
        // Node must not be completed
        if (completedNodeIds.has(node.id)) return false;

        // All dependencies must be completed
        const deps = node.dependencies || [];
        return deps.every(depId => completedNodeIds.has(depId));
      })
      .map(node => node.id);
  }
}
