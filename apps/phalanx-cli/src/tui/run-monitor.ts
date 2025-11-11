import blessed from 'blessed';
import contrib from 'blessed-contrib';
import EventSource from 'eventsource';
import { createWorkflowClient } from '../utils/api.js';
import dayjs from 'dayjs';

interface RunDetails {
  id: string;
  workflowId: string;
  status: string;
  startedAt: string;
  endedAt?: string;
  error?: any;
  nodes?: NodeExecution[];
}

interface NodeExecution {
  id: string;
  nodeId: string;
  type: string;
  status: string;
  startedAt?: string;
  endedAt?: string;
  error?: any;
}

export class RunMonitor {
  private screen: blessed.Widgets.Screen;
  private grid: any;
  private runInfo: blessed.Widgets.BoxElement;
  private nodeTable: contrib.Widgets.TableElement;
  private progressBar: contrib.Widgets.GaugeElement;
  private logList: contrib.Widgets.LogElement;
  private statusBar: blessed.Widgets.TextElement;
  private eventSource?: EventSource;
  private runId: string;
  private runDetails?: RunDetails;
  private nodes: Map<string, NodeExecution> = new Map();

  constructor(runId: string) {
    this.runId = runId;

    // Create blessed screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: `Phalanx - Run Monitor: ${runId.substring(0, 8)}`,
      fullUnicode: true,
    });

    // Create grid layout
    this.grid = new contrib.grid({
      rows: 12,
      cols: 12,
      screen: this.screen,
    });

    // Run info box (top)
    this.runInfo = this.grid.set(0, 0, 2, 12, blessed.box, {
      label: ' Run Information ',
      content: 'Loading...',
      border: { type: 'line', fg: 'cyan' },
      style: {
        fg: 'white',
      },
    });

    // Progress bar
    this.progressBar = this.grid.set(2, 0, 1, 12, contrib.gauge, {
      label: ' Progress ',
      stroke: 'green',
      fill: 'white',
      border: { type: 'line', fg: 'cyan' },
    });

    // Node execution table
    this.nodeTable = this.grid.set(3, 0, 5, 12, contrib.table, {
      keys: true,
      vi: true,
      fg: 'white',
      selectedFg: 'white',
      selectedBg: 'blue',
      interactive: false,
      label: ' Node Executions ',
      border: { type: 'line', fg: 'cyan' },
      columnSpacing: 2,
      columnWidth: [15, 15, 10, 15, 10],
    });

    // Event log
    this.logList = this.grid.set(8, 0, 3, 12, contrib.log, {
      fg: 'green',
      selectedFg: 'green',
      label: ' Event Log ',
      border: { type: 'line', fg: 'cyan' },
      scrollable: true,
      scrollbar: {
        ch: ' ',
        track: {
          bg: 'yellow',
        },
        style: {
          inverse: true,
        },
      },
    });

    // Status bar
    this.statusBar = this.grid.set(11, 0, 1, 12, blessed.text, {
      content: ' [q] Back to Dashboard  [r] Refresh ',
      style: {
        fg: 'white',
        bg: 'blue',
      },
    });

    this.setupKeys();
    this.loadRunDetails();
    this.connectEventStream();
  }

  private setupKeys(): void {
    this.screen.key(['q', 'C-c'], () => {
      this.cleanup();
      process.exit(0);
    });

    this.screen.key(['r'], () => {
      this.log('Refreshing...');
      this.loadRunDetails();
    });
  }

  private async loadRunDetails(): Promise<void> {
    try {
      const client = createWorkflowClient();
      const data = await client.get<RunDetails>(`/api/v1/runs/${this.runId}`);

      this.runDetails = data;

      // Update nodes
      if (data.nodes) {
        for (const node of data.nodes) {
          this.nodes.set(node.nodeId, node);
        }
      }

      this.updateRunInfo();
      this.updateProgress();
      this.updateNodeTable();
      this.screen.render();
    } catch (error: any) {
      this.log(`Error loading run: ${error.message}`);
    }
  }

  private updateRunInfo(): void {
    if (!this.runDetails) return;

    const duration = this.runDetails.endedAt
      ? `${Math.round((new Date(this.runDetails.endedAt).getTime() - new Date(this.runDetails.startedAt).getTime()) / 1000)}s`
      : 'Running...';

    const errorInfo = this.runDetails.error ? `\n  Error: ${JSON.stringify(this.runDetails.error)}` : '';

    const content = `
  Run ID:      ${this.runDetails.id}
  Workflow:    ${this.runDetails.workflowId}
  Status:      ${this.colorizeStatus(this.runDetails.status)}
  Started:     ${dayjs(this.runDetails.startedAt).format('YYYY-MM-DD HH:mm:ss')}
  Duration:    ${duration}${errorInfo}
    `.trim();

    this.runInfo.setContent(content);
  }

  private updateProgress(): void {
    const nodes = Array.from(this.nodes.values());
    if (nodes.length === 0) {
      this.progressBar.setPercent(0);
      return;
    }

    const completed = nodes.filter((n) => n.status === 'succeeded' || n.status === 'failed').length;
    const percent = Math.round((completed / nodes.length) * 100);

    this.progressBar.setPercent(percent);
  }

  private updateNodeTable(): void {
    const nodes = Array.from(this.nodes.values());

    const headers = ['Node ID', 'Type', 'Status', 'Started', 'Duration'];
    const data = nodes.map((node) => {
      const duration =
        node.startedAt && node.endedAt
          ? `${Math.round((new Date(node.endedAt).getTime() - new Date(node.startedAt).getTime()) / 1000)}s`
          : node.startedAt
            ? 'Running...'
            : '-';

      return [
        node.nodeId.substring(0, 13) + '..',
        node.type,
        this.colorizeStatus(node.status),
        node.startedAt ? dayjs(node.startedAt).format('HH:mm:ss') : '-',
        duration,
      ];
    });

    this.nodeTable.setData({
      headers,
      data,
    });
  }

  private colorizeStatus(status: string): string {
    const colors: Record<string, string> = {
      pending: '{gray-fg}pending{/}',
      queued: '{yellow-fg}queued{/}',
      running: '{cyan-fg}running{/}',
      waiting: '{magenta-fg}waiting{/}',
      succeeded: '{green-fg}succeeded{/}',
      failed: '{red-fg}failed{/}',
      canceled: '{gray-fg}canceled{/}',
    };

    return colors[status] || status;
  }

  private connectEventStream(): void {
    const baseUrl = process.env.PHALANX_WORKFLOW_API || 'http://localhost:3000';
    const url = `${baseUrl}/api/v1/runs/${this.runId}/events`;

    this.eventSource = new EventSource(url, {
      headers: {
        'x-tenant-id': 'default',
      },
    });

    this.eventSource.onmessage = (event: any) => {
      try {
        const data = JSON.parse(event.data);

        // Log event
        const msg = `${data.type}: ${data.nodeId || 'workflow'} - ${data.status || ''}`;
        this.log(msg);

        // Update node status
        if (data.nodeId && data.status) {
          const existing = this.nodes.get(data.nodeId);
          if (existing) {
            existing.status = data.status;
            if (data.type === 'node_started') {
              existing.startedAt = new Date().toISOString();
            } else if (data.type === 'node_completed' || data.type === 'node_failed') {
              existing.endedAt = new Date().toISOString();
            }
          } else {
            // Create new node entry
            this.nodes.set(data.nodeId, {
              id: data.nodeId,
              nodeId: data.nodeId,
              type: data.nodeType || 'unknown',
              status: data.status,
              startedAt: data.type === 'node_started' ? new Date().toISOString() : undefined,
              endedAt:
                data.type === 'node_completed' || data.type === 'node_failed'
                  ? new Date().toISOString()
                  : undefined,
            });
          }
        }

        // Update run status
        if (data.type === 'run_completed' || data.type === 'run_failed' || data.type === 'run_canceled') {
          if (this.runDetails) {
            this.runDetails.status = data.status;
            this.runDetails.endedAt = new Date().toISOString();
          }
        }

        this.updateRunInfo();
        this.updateProgress();
        this.updateNodeTable();
        this.screen.render();
      } catch (error) {
        // Ignore parse errors
      }
    };

    this.eventSource.onerror = () => {
      this.log('Event stream disconnected');
    };

    this.log('Connected to event stream');
  }

  private log(message: string): void {
    const timestamp = dayjs().format('HH:mm:ss');
    this.logList.log(`[${timestamp}] ${message}`);
  }

  private cleanup(): void {
    if (this.eventSource) {
      this.eventSource.close();
    }
  }

  public render(): void {
    this.log(`Monitoring run: ${this.runId}`);
    this.screen.render();
  }
}

export function startRunMonitor(runId: string): void {
  const monitor = new RunMonitor(runId);
  monitor.render();
}
