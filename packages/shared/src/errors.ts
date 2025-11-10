export class PhalanxError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AuthenticationError extends PhalanxError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'AUTHENTICATION_ERROR', 401, metadata);
  }
}

export class AuthorizationError extends PhalanxError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'AUTHORIZATION_ERROR', 403, metadata);
  }
}

export class ValidationError extends PhalanxError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, metadata);
  }
}

export class NotFoundError extends PhalanxError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'NOT_FOUND', 404, metadata);
  }
}

export class ConfigurationError extends PhalanxError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'CONFIGURATION_ERROR', 500, metadata);
  }
}

export class ToolExecutionError extends PhalanxError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'TOOL_EXECUTION_ERROR', 500, metadata);
  }
}

export class LLMProviderError extends PhalanxError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'LLM_PROVIDER_ERROR', 502, metadata);
  }
}
