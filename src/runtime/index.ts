/**
 * ATiQ WebContainer Runtime Module
 * Exports all runtime implementations and utilities
 */

// Core contracts and types
export * from './contracts';
export * from './types';

// Browser runtime implementations
export { BrowserRuntime } from './browser/browser-runtime';
export { WebFS } from './browser/web-fs';
export { WebProc } from './browser/web-proc';
export { WebNet } from './browser/web-net';
export { WebSnapshots } from './browser/web-snapshots';
export { WebReceipts } from './browser/web-receipts';

// Runtime registry
export { RuntimeRegistry } from './contracts';

// Factory function for creating runtimes
import { RuntimeRegistry, RuntimeProvider, ProjectInfo, RuntimeContract } from './contracts';
import { BrowserRuntime } from './browser/browser-runtime';

const registry = new RuntimeRegistry();

// Register the browser runtime provider
registry.register({
  name: 'Browser Runtime',
  priority: 100, // High priority for browser environment
  async canHandle(project: ProjectInfo): Promise<boolean> {
    // Browser runtime can handle projects without native dependencies
    return !project.hasNativeDeps;
  },
  async create(): Promise<RuntimeContract> {
    const runtime = new BrowserRuntime();
    await runtime.start();
    return runtime;
  }
});

/**
 * Create a runtime for the given project
 */
export async function createRuntime(project: ProjectInfo): Promise<RuntimeContract> {
  return await registry.createRuntime(project);
}

/**
 * Get the runtime registry for adding custom providers
 */
export function getRuntimeRegistry(): RuntimeRegistry {
  return registry;
}
