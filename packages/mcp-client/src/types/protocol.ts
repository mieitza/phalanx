import { z } from 'zod';

/**
 * JSON-RPC 2.0 Message Types
 */

export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});

export const JsonRpcResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      data: z.unknown().optional(),
    })
    .optional(),
});

export const JsonRpcNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});

export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;
export type JsonRpcNotification = z.infer<typeof JsonRpcNotificationSchema>;

/**
 * MCP Protocol Types
 */

export interface MCPServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
  capabilities?: {
    tools?: boolean;
    prompts?: boolean;
    resources?: boolean;
  };
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPToolCallRequest {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolCallResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface MCPPromptDefinition {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}

export interface MCPPromptResponse {
  messages: Array<{
    role: 'user' | 'assistant';
    content: {
      type: 'text' | 'image' | 'resource';
      text?: string;
      data?: string;
      mimeType?: string;
    };
  }>;
}

export interface MCPResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * MCP Protocol Methods
 */

export const MCPMethods = {
  // Lifecycle
  INITIALIZE: 'initialize',
  INITIALIZED: 'initialized',
  PING: 'ping',
  SHUTDOWN: 'shutdown',

  // Tools
  LIST_TOOLS: 'tools/list',
  CALL_TOOL: 'tools/call',

  // Prompts
  LIST_PROMPTS: 'prompts/list',
  GET_PROMPT: 'prompts/get',

  // Resources
  LIST_RESOURCES: 'resources/list',
  READ_RESOURCE: 'resources/read',

  // Notifications
  TOOLS_CHANGED: 'notifications/tools/list_changed',
  PROMPTS_CHANGED: 'notifications/prompts/list_changed',
  RESOURCES_CHANGED: 'notifications/resources/list_changed',
} as const;

/**
 * Error Codes
 */

export const MCPErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR: -32000,
  TOOL_NOT_FOUND: -32001,
  TOOL_EXECUTION_ERROR: -32002,
} as const;

export class MCPError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'MCPError';
  }
}
