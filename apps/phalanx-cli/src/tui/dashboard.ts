import blessed from 'blessed';
import contrib from 'blessed-contrib';
import EventSource from 'eventsource';
import { createWorkflowClient } from '../utils/api.js';
import dayjs from 'dayjs';

interface Run {
  id: string;
  workflowId: string;
  status: string;
  startedAt: string;
  endedAt?: string;
  error?: any;
}

export class WorkflowDashboard {
  private screen: blessed.Widgets.Screen;
  private grid: any;
  private runTable: contrib.Widgets.TableElement;
  private logList: contrib.Widgets.LogElement;
  private statusBar: blessed.Widgets.TextElement;
  private runs: Map<string, Run> = new Map();
  private eventSource?: EventSource;
  private selectedRunId?: string;
  private refreshInterval?: NodeJS.Timeout;

  constructor() {
    // Create blessed screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Phalanx Workflow Monitor',
      fullUnicode: true,
    });

    // Create grid layout
    this.grid = new contrib.grid({
      rows: 12,
      cols: 12,
      screen: this.screen,
    });

    // Create run table (top half)
    this.runTable = this.grid.set(0, 0, 8, 12, contrib.table, {
      keys: true,
      vi: true,
      fg: 'white',
      selectedFg: 'white',
      selectedBg: 'blue',
      interactive: true,
      label: ' Workflow Runs ',
      width: '100%',
      height: '100%',
      border: { type: 'line', fg: 'cyan' },
      columnSpacing: 2,
      columnWidth: [20, 20, 12, 20, 10],
    });

    // Create log viewer (bottom part)
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

    // Create status bar (bottom)
    this.statusBar = this.grid.set(11, 0, 1, 12, blessed.text, {
      content: ' [↑/↓] Navigate  [Enter] Details  [r] Refresh  [q] Quit ',
      style: {
        fg: 'white',
        bg: 'blue',
      },
    });

    // Setup key bindings
    this.setupKeys();

    // Initial data load
    this.refreshData();

    // Auto-refresh every 5 seconds
    this.refreshInterval = setInterval(() => this.refreshData(), 5000);
  }

  private setupKeys(): void {
    // Quit
    this.screen.key(['q', 'C-c'], () => {
      this.cleanup();
      process.exit(0);
    });

    // Refresh
    this.screen.key(['r'], () => {
      this.log('Refreshing data...');
      this.refreshData();
    });

    // Select run
    (this.runTable as any).rows.on('select', (item: any, index: number) => {
      if (index > 0) {
        // Skip header row
        const runs = Array.from(this.runs.values());
        const selectedRun = runs[index - 1];
        if (selectedRun) {
          this.selectedRunId = selectedRun.id;
          this.log(`Selected run: ${this.selectedRunId}`);
        }
      }
    });

    // Watch selected run
    this.screen.key(['enter'], () => {
      if (this.selectedRunId) {
        this.watchRun(this.selectedRunId);
      }
    });

    // Focus table on arrow keys
    this.screen.key(['up', 'down'], () => {
      this.runTable.focus();
    });
  }

  private async refreshData(): Promise<void> {
    try {
      const client = createWorkflowClient();
      const data = await client.get<{ runs: Run[] }>('/api/v1/runs');

      // Update runs map
      this.runs.clear();
      for (const run of data.runs) {
        this.runs.set(run.id, run);
      }

      this.updateTable();
      this.screen.render();
    } catch (error: any) {
      this.log(`Error fetching runs: ${error.message}`);
    }
  }

  private updateTable(): void {
    const runs = Array.from(this.runs.values());

    const headers = ['Run ID', 'Workflow ID', 'Status', 'Started', 'Duration'];
    const data = runs.map((run) => {
      const duration = run.endedAt
        ? `${Math.round((new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s`
        : 'Running...';

      return [
        run.id.substring(0, 18) + '..',
        run.workflowId.substring(0, 18) + '..',
        this.colorizeStatus(run.status),
        dayjs(run.startedAt).format('MM/DD HH:mm:ss'),
        duration,
      ];
    });

    this.runTable.setData({
      headers,
      data,
    });
  }

  private colorizeStatus(status: string): string {
    const colors: Record<string, string> = {
      queued: '{yellow-fg}queued{/}',
      running: '{cyan-fg}running{/}',
      waiting: '{magenta-fg}waiting{/}',
      succeeded: '{green-fg}succeeded{/}',
      failed: '{red-fg}failed{/}',
      canceled: '{gray-fg}canceled{/}',
    };

    return colors[status] || status;
  }

  private log(message: string): void {
    const timestamp = dayjs().format('HH:mm:ss');
    this.logList.log(`[${timestamp}] ${message}`);
  }

  private watchRun(runId: string): void {
    this.log(`Watching run: ${runId}`);

    // Close existing event source
    if (this.eventSource) {
      this.eventSource.close();
    }

    // Connect to SSE endpoint
    const baseUrl = process.env.PHALANX_WORKFLOW_API || 'http://localhost:3000';
    const url = `${baseUrl}/api/v1/runs/${runId}/events`;

    this.eventSource = new EventSource(url, {
      headers: {
        'x-tenant-id': 'default',
      },
    });

    this.eventSource.onmessage = (event: any) => {
      try {
        const data = JSON.parse(event.data);
        const msg = `[${runId.substring(0, 8)}] ${data.type}: ${data.nodeId || 'workflow'} - ${data.status || ''}`;
        this.log(msg);

        // Update run in map if status changed
        if (data.type === 'run_completed' || data.type === 'run_failed') {
          this.refreshData();
        }
      } catch (error) {
        // Ignore parse errors
      }
    };

    this.eventSource.onerror = (error: any) => {
      this.log(`Event stream error for run ${runId}`);
      this.eventSource?.close();
    };
  }

  private cleanup(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    if (this.eventSource) {
      this.eventSource.close();
    }
  }

  public render(): void {
    this.log('Dashboard started. Monitoring workflows...');
    this.runTable.focus();
    this.screen.render();
  }
}

// Export function to start dashboard
export function startDashboard(): void {
  const dashboard = new WorkflowDashboard();
  dashboard.render();
}
