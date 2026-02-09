import { RuntimeContract, RuntimeInfo, RuntimeCapabilities, RuntimeLimits, FileSystemContract, ProcessContract, NetworkContract } from '../runtime/contracts';

/**
 * Remote runner implementation for hybrid fallback
 * Executes commands on a remote VPS when browser can't handle them
 */
export class RemoteRunner implements RuntimeContract {
  public readonly fs: FileSystemContract;
  public readonly proc: ProcessContract;
  public readonly net: NetworkContract;
  public readonly snapshots: any;
  public readonly receipts: any;

  private baseUrl: string;
  private apiKey: string;
  private sessionId: string;

  constructor(config: {
    baseUrl: string;
    apiKey: string;
    fs: FileSystemContract;
    proc: ProcessContract;
    net: NetworkContract;
    snapshots: any;
    receipts: any;
  }) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.fs = config.fs;
    this.proc = config.proc;
    this.net = config.net;
    this.snapshots = config.snapshots;
    this.receipts = config.receipts;
    this.sessionId = this.generateSessionId();
  }

  async start(): Promise<void> {
    // Initialize remote session
    const response = await this.makeRequest('/api/session/start', {
      sessionId: this.sessionId,
      capabilities: this.getCapabilities(),
      limits: this.getLimits()
    });

    if (!response.ok) {
      throw new Error(`Failed to start remote session: ${response.statusText}`);
    }

    console.log('Remote runner session started:', this.sessionId);
  }

  async stop(): Promise<void> {
    const response = await this.makeRequest('/api/session/stop', {
      sessionId: this.sessionId
    });

    if (!response.ok) {
      throw new Error(`Failed to stop remote session: ${response.statusText}`);
    }

    console.log('Remote runner session stopped:', this.sessionId);
  }

  isRunning(): boolean {
    return true; // Remote runner is always "running" when instantiated
  }

  getInfo(): RuntimeInfo {
    return {
      name: 'ATiQ Remote Runner',
      version: '1.0.0',
      capabilities: this.getCapabilities(),
      limits: this.getLimits()
    };
  }

  private getCapabilities(): RuntimeCapabilities {
    return {
      filesystem: true,
      processes: true,
      networking: true,
      snapshots: true,
      nativeDeps: true, // Remote runner can handle native deps
      fileWatching: true
    };
  }

  private getLimits(): RuntimeLimits {
    return {
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxMemory: 2 * 1024 * 1024 * 1024, // 2GB
      maxProcesses: 50,
      maxExecutionTime: 300000 // 5 minutes
    };
  }

  private async makeRequest(endpoint: string, data: any): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Session-ID': this.sessionId
      },
      body: JSON.stringify(data)
    });
  }

  private generateSessionId(): string {
    return `remote-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Detect if a project needs remote runner
   */
  static async requiresRemoteRunner(project: any): Promise<boolean> {
    // Check for native dependencies
    if (project.hasNativeDeps) {
      return true;
    }

    // Check for heavy packages
    if (project.packageJson) {
      const heavyPackages = [
        'sharp', 'canvas', 'sqlite3', 'bcrypt', 'node-gyp',
        'prisma', 'puppeteer', 'playwright', 'selenium-webdriver'
      ];

      const allDeps = {
        ...project.packageJson.dependencies,
        ...project.packageJson.devDependencies
      };

      for (const heavyPkg of heavyPackages) {
        if (allDeps[heavyPkg]) {
          return true;
        }
      }
    }

    return false;
  }
}
