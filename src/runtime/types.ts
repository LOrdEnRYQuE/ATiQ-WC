import { FileStats } from './contracts';

/**
 * Shared types used across ATiQ WebContainer runtime implementations
 */

export interface VirtualFile {
  path: string;
  content: Uint8Array;
  stats: FileStats;
  children?: Map<string, VirtualFile>;
}

export interface ProcessContext {
  pid: number;
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  startTime: number;
  status: 'running' | 'completed' | 'killed';
}

export interface CacheEntry {
  key: string;
  data: Uint8Array;
  timestamp: number;
  expires?: number;
  metadata?: Record<string, any>;
}

export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: Uint8Array;
  timestamp: number;
}

export interface NetworkResponse {
  id: string;
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
  timestamp: number;
  duration: number;
}

export interface ModuleResolution {
  resolved: string;
  type: 'file' | 'package' | 'builtin';
  package?: {
    name: string;
    version: string;
    main?: string;
    exports?: Record<string, any>;
  };
}

export interface BuildResult {
  success: boolean;
  outputs: Record<string, Uint8Array>;
  warnings: string[];
  errors: string[];
  duration: number;
  metadata: Record<string, any>;
}

export interface DevServerConfig {
  port: number;
  root: string;
  index?: string;
  fallback?: string;
  headers?: Record<string, string>;
}

export interface HotReloadEvent {
  type: 'add' | 'update' | 'delete';
  path: string;
  timestamp: number;
}

// Error types
export class ATiQError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ATiQError';
  }
}

export class FileSystemError extends ATiQError {
  constructor(message: string, code: string, public path?: string) {
    super(message, code, { path });
    this.name = 'FileSystemError';
  }
}

export class ProcessError extends ATiQError {
  constructor(message: string, code: string, public command?: string, public exitCode?: number) {
    super(message, code, { command, exitCode });
    this.name = 'ProcessError';
  }
}

export class NetworkError extends ATiQError {
  constructor(message: string, code: string, public url?: string) {
    super(message, code, { url });
    this.name = 'NetworkError';
  }
}

export class SecurityError extends ATiQError {
  constructor(message: string, code: string, public operation?: string) {
    super(message, code, { operation });
    this.name = 'SecurityError';
  }
}
