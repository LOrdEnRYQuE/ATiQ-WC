/**
 * ATiQ WebContainer - Better than StackBlitz by being honest about what "better" means
 * 
 * Main entry point for the ATiQ WebContainer library
 */

// Core runtime
export * from './runtime';

// Toolchain
export * from './toolchain';

// Preview server
export * from './preview';

// Main factory
import { createRuntime, ProjectInfo } from './runtime';
import { Toolchain } from './toolchain';
import { createPreviewServer } from './preview';
import { RuntimeContract } from './runtime/contracts';

/**
 * ATiQ WebContainer - Main class that combines all functionality
 */
export class ATiQWebContainer {
  private runtime: RuntimeContract;
  private toolchain: Toolchain;
  private previewServer: import('./preview').PreviewServer | null = null;

  constructor(private project: ProjectInfo) {}

  /**
   * Initialize the container
   */
  async init(): Promise<void> {
    // Create the appropriate runtime
    this.runtime = await createRuntime(this.project);
    
    // Create toolchain
    this.toolchain = new Toolchain(this.runtime.fs, this.runtime.proc);
    
    console.log('ATiQ WebContainer initialized');
    console.log('Runtime info:', this.runtime.getInfo());
  }

  /**
   * Start the preview server
   */
  async startPreview(config?: {
    port?: number;
    root?: string;
    index?: string;
  }): Promise<void> {
    if (!this.runtime) {
      throw new Error('Container not initialized. Call init() first.');
    }

    const { createPreviewServer } = await import('./preview');
    
    this.previewServer = createPreviewServer(
      this.runtime.fs,
      this.runtime.net,
      config
    );

    await this.previewServer.start(config || {});
  }

  /**
   * Stop the preview server
   */
  async stopPreview(): Promise<void> {
    if (this.previewServer) {
      await this.previewServer.stop();
      this.previewServer = null;
    }
  }

  /**
   * Run a command
   */
  async run(command: string, args: string[] = []): Promise<any> {
    if (!this.runtime) {
      throw new Error('Container not initialized. Call init() first.');
    }

    return await this.runtime.proc.spawn(command, args);
  }

  /**
   * Build the project
   */
  async build(options: {
    entryPoint?: string;
    outDir?: string;
    production?: boolean;
  } = {}): Promise<any> {
    if (!this.toolchain) {
      throw new Error('Container not initialized. Call init() first.');
    }

    const entryPoint = options.entryPoint || 'src/index.ts';
    
    if (options.production) {
      return await this.toolchain.prodBuild(entryPoint, {
        outDir: options.outDir
      });
    } else {
      return await this.toolchain.devBuild(entryPoint, {
        outDir: options.outDir
      });
    }
  }

  /**
   * Get the runtime instance
   */
  getRuntime(): RuntimeContract {
    return this.runtime;
  }

  /**
   * Get the toolchain instance
   */
  getToolchain(): Toolchain {
    return this.toolchain;
  }

  /**
   * Get container status
   */
  getStatus(): {
    initialized: boolean;
    runtime: any;
    preview: any;
  } {
    return {
      initialized: !!this.runtime,
      runtime: this.runtime?.getInfo(),
      preview: this.previewServer?.getStatus()
    };
  }
}

/**
 * Create a new ATiQ WebContainer instance
 */
export async function createWebContainer(project: ProjectInfo): Promise<ATiQWebContainer> {
  const container = new ATiQWebContainer(project);
  await container.init();
  return container;
}

// Re-export for convenience
export { ProjectInfo, RuntimeContract };
