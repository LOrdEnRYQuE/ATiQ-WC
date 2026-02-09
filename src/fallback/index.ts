/**
 * ATiQ WebContainer Fallback Module
 * Exports hybrid fallback functionality
 */

export { RemoteRunner } from './remote-runner';

import { RemoteRunner } from './remote-runner';
import { RuntimeContract, ProjectInfo } from '../runtime/contracts';

/**
 * Hybrid runtime provider that chooses between browser and remote
 */
export class HybridRuntimeProvider {
  constructor(
    private browserRuntime: () => Promise<RuntimeContract>,
    private remoteRunner: (config: any) => Promise<RuntimeContract>
  ) {}

  async createRuntime(project: ProjectInfo): Promise<RuntimeContract> {
    // Check if project needs remote runner
    const needsRemote = await RemoteRunner.requiresRemoteRunner(project);
    
    if (needsRemote) {
      console.log('🔄 Using remote runner for native dependencies');
      
      // Create remote runner with browser runtime delegates
      const browserRuntime = await this.browserRuntime();
      
      return await this.remoteRunner({
        baseUrl: 'https://api.atiq.dev', // Production API
        apiKey: (typeof globalThis !== 'undefined' && globalThis.process?.env?.ATIQ_API_KEY) || 'demo-key',
        fs: browserRuntime.fs,
        proc: browserRuntime.proc,
        net: browserRuntime.net,
        snapshots: browserRuntime.snapshots,
        receipts: browserRuntime.receipts
      });
    } else {
      console.log('⚡ Using browser runtime for optimal performance');
      return await this.browserRuntime();
    }
  }
}

/**
 * Create a hybrid runtime provider
 */
export function createHybridProvider(
  browserRuntime: () => Promise<RuntimeContract>,
  remoteRunner: (config: any) => Promise<RuntimeContract>
): HybridRuntimeProvider {
  return new HybridRuntimeProvider(browserRuntime, remoteRunner);
}
