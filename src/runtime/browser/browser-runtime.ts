import { RuntimeContract, RuntimeInfo, RuntimeCapabilities, RuntimeLimits } from '../contracts';
import { WebFS } from './web-fs';
import { WebProc } from './web-proc';
import { WebNet } from './web-net';
import { WebSnapshots } from './web-snapshots';
import { WebReceipts } from './web-receipts';

/**
 * Browser-based runtime implementation
 * This is the main entry point for ATiQ WebContainer in the browser
 */
export class BrowserRuntime implements RuntimeContract {
  public readonly fs: WebFS;
  public readonly proc: WebProc;
  public readonly net: WebNet;
  public readonly snapshots: WebSnapshots;
  public readonly receipts: WebReceipts;

  private isInitialized = false;
  private isStarted = false;

  constructor() {
    this.fs = new WebFS();
    this.proc = new WebProc();
    this.net = new WebNet();
    this.snapshots = new WebSnapshots();
    this.receipts = new WebReceipts();
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    try {
      // Initialize all components
      await Promise.all([
        this.fs.init(),
        this.snapshots.init(),
        this.receipts.init()
      ]);

      this.isStarted = true;
      console.log('ATiQ Browser Runtime started');
    } catch (error) {
      throw new Error(`Failed to start runtime: ${error}`);
    }
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    // Cleanup resources
    // Note: Web Workers and Service Workers will be cleaned up automatically
    this.isStarted = false;
    console.log('ATiQ Browser Runtime stopped');
  }

  isRunning(): boolean {
    return this.isStarted;
  }

  getInfo(): RuntimeInfo {
    return {
      name: 'ATiQ Browser Runtime',
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
      nativeDeps: false, // Browser runtime cannot handle native deps
      fileWatching: true
    };
  }

  private getLimits(): RuntimeLimits {
    return {
      maxFileSize: 50 * 1024 * 1024, // 50MB
      maxMemory: 512 * 1024 * 1024, // 512MB
      maxProcesses: 10,
      maxExecutionTime: 30000 // 30 seconds
    };
  }
}
