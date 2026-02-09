/**
 * ATiQ WebContainer Runtime Contracts
 * 
 * These are the core APIs that define the ATiQ superpower.
 * All implementations (browser, fallback, etc.) must conform to these contracts.
 */

// ============================================================================
// FILESYSTEM CONTRACTS
// ============================================================================

export interface FileStats {
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  mtime: number;
  ctime: number;
  mode: number;
}

export interface FileSystemContract {
  // Basic file operations
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<FileStats>;
  
  // Directory operations
  readdir(path: string): Promise<string[]>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  rmdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  
  // File tree operations
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
  
  // Atomic operations
  copyFile(src: string, dest: string): Promise<void>;
  
  // Watching (optional, may not be supported in all implementations)
  watch?(path: string, callback: (event: FileChangeEvent) => void): Promise<() => void>;
}

export interface FileChangeEvent {
  type: 'change' | 'rename' | 'delete';
  path: string;
}

// ============================================================================
// PROCESS CONTRACTS
// ============================================================================

export interface ProcessOptions {
  env?: Record<string, string>;
  cwd?: string;
  stdin?: Uint8Array;
  timeout?: number;
}

export interface ProcessResult {
  exitCode: number;
  stdout: Uint8Array;
  stderr: Uint8Array;
  signal?: string;
}

export interface ProcessContract {
  // Spawn a process and get result (blocking)
  spawn(command: string, args: string[], options?: ProcessOptions): Promise<ProcessResult>;
  
  // Spawn a process and get streams (non-blocking)
  spawnStream(command: string, args: string[], options?: ProcessOptions): Promise<ProcessStreams>;
  
  // Kill a running process
  kill(pid: number, signal?: string): Promise<void>;
  
  // Check if command exists
  which(command: string): Promise<string | null>;
}

export interface ProcessStreams {
  pid: number;
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  stdin: WritableStream<Uint8Array>;
  wait(): Promise<ProcessResult>;
}

// ============================================================================
// NETWORKING CONTRACTS
// ============================================================================

export interface NetworkContract {
  // Fetch external resources
  fetch(url: string, options?: RequestInit): Promise<Response>;
  
  // Start a local server
  listen(port: number, handler: (req: ServerRequest) => Promise<ServerResponse>): Promise<Server>;
  
  // Check if port is available
  isPortAvailable(port: number): Promise<boolean>;
}

export interface ServerRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: ReadableStream<Uint8Array>;
}

export interface ServerResponse {
  status: number;
  headers: Record<string, string>;
  body: WritableStream<Uint8Array> | Uint8Array;
}

export interface Server {
  port: number;
  close(): Promise<void>;
}

// ============================================================================
// SNAPSHOT CONTRACTS
// ============================================================================

export interface SnapshotContract {
  // Create a snapshot of current state
  create(): Promise<Snapshot>;
  
  // Restore from a snapshot
  restore(snapshot: Snapshot): Promise<void>;
  
  // List available snapshots
  list(): Promise<SnapshotInfo[]>;
  
  // Delete a snapshot
  delete(id: string): Promise<void>;
}

export interface Snapshot {
  id: string;
  timestamp: number;
  data: Uint8Array;
  metadata: Record<string, any>;
}

export interface SnapshotInfo {
  id: string;
  timestamp: number;
  size: number;
  metadata: Record<string, any>;
}

// ============================================================================
// RECEIPT CONTRACTS
// ============================================================================

export interface ReceiptContract {
  // Record an action with its result
  record(action: Action): Promise<Receipt>;
  
  // Get receipt by ID
  get(id: string): Promise<Receipt | null>;
  
  // List receipts with filtering
  list(filter?: ReceiptFilter): Promise<Receipt[]>;
  
  // Verify receipt integrity
  verify(receipt: Receipt): Promise<boolean>;
}

export interface Action {
  id: string;
  type: 'fs' | 'proc' | 'net' | 'snapshot';
  command: string;
  args?: any[];
  timestamp: number;
  input?: any;
}

export interface Receipt {
  id: string;
  action: Action;
  result: any;
  timestamp: number;
  duration: number;
  success: boolean;
  error?: string;
  metadata: Record<string, any>;
}

export interface ReceiptFilter {
  type?: string;
  since?: number;
  until?: number;
  success?: boolean;
}

// ============================================================================
// MAIN RUNTIME CONTRACT
// ============================================================================

export interface RuntimeContract {
  readonly fs: FileSystemContract;
  readonly proc: ProcessContract;
  readonly net: NetworkContract;
  readonly snapshots: SnapshotContract;
  readonly receipts: ReceiptContract;
  
  // Runtime info
  getInfo(): RuntimeInfo;
  
  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

export interface RuntimeInfo {
  name: string;
  version: string;
  capabilities: RuntimeCapabilities;
  limits: RuntimeLimits;
}

export interface RuntimeCapabilities {
  filesystem: boolean;
  processes: boolean;
  networking: boolean;
  snapshots: boolean;
  nativeDeps: boolean;
  fileWatching: boolean;
}

export interface RuntimeLimits {
  maxFileSize: number;
  maxMemory: number;
  maxProcesses: number;
  maxExecutionTime: number;
}

// ============================================================================
// RUNTIME PROVIDER REGISTRY
// ============================================================================

export interface RuntimeProvider {
  name: string;
  priority: number; // Higher = preferred
  create(): Promise<RuntimeContract>;
  canHandle(project: ProjectInfo): Promise<boolean>;
}

export interface ProjectInfo {
  files: Record<string, Uint8Array>;
  packageJson?: any;
  lockfile?: any;
  hasNativeDeps: boolean;
}

export class RuntimeRegistry {
  private providers: RuntimeProvider[] = [];
  
  register(provider: RuntimeProvider): void {
    this.providers.push(provider);
    this.providers.sort((a, b) => b.priority - a.priority);
  }
  
  async createRuntime(project: ProjectInfo): Promise<RuntimeContract> {
    for (const provider of this.providers) {
      if (await provider.canHandle(project)) {
        return await provider.create();
      }
    }
    throw new Error('No suitable runtime provider found');
  }
  
  getProviders(): RuntimeProvider[] {
    return [...this.providers];
  }
}
