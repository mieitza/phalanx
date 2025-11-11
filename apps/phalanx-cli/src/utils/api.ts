import { configManager } from '../config/index.js';

export class APIClient {
  private baseUrl: string;
  private tenantId: string;

  constructor(serviceUrl: string) {
    this.baseUrl = serviceUrl;
    this.tenantId = configManager.get().tenantId;
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-tenant-id': this.tenantId,
      ...((options.headers as Record<string, string>) || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error: any = await response.json().catch(() => ({
        error: `HTTP ${response.status}: ${response.statusText}`
      }));
      throw new Error(error.error || error.message || `Request failed: ${response.statusText}`);
    }

    return await response.json() as T;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  async stream(path: string, onMessage: (data: any) => void): Promise<void> {
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      headers: {
        'x-tenant-id': this.tenantId,
        'Accept': 'text/event-stream',
      },
    });

    if (!response.ok) {
      throw new Error(`Stream request failed: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            onMessage(data);
          } catch (error) {
            // Ignore parse errors
          }
        }
      }
    }
  }
}

export function createWorkflowClient(): APIClient {
  const config = configManager.get();
  return new APIClient(config.workflowServiceUrl);
}

export function createMCPClient(): APIClient {
  const config = configManager.get();
  return new APIClient(config.mcpServiceUrl);
}
