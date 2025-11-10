/**
 * Common type definitions used across the platform
 */

export type WorkflowStatus = 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'canceled';

export type NodeType = 'prompt' | 'tool' | 'decision' | 'parallel' | 'loop' | 'wait' | 'approval';

export type ToolKind = 'shell' | 'http' | 'mcp';

export type Role = 'admin' | 'operator' | 'developer' | 'viewer';

export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Tenant extends BaseEntity {
  name: string;
  slug: string;
}

export interface User extends BaseEntity {
  email: string;
  name: string;
  tenantId: string;
  roles: Role[];
}
