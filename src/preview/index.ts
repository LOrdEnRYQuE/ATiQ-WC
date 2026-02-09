/**
 * ATiQ WebContainer Preview Module
 * Exports preview server functionality
 */

export { PreviewServer } from './preview-server';

import { PreviewServer } from './preview-server';
import { FileSystemContract, NetworkContract } from '../runtime/contracts';
import { DevServerConfig } from '../runtime/types';

/**
 * Create a preview server with default configuration
 */
export function createPreviewServer(
  fs: FileSystemContract,
  net: NetworkContract,
  config: Partial<DevServerConfig> = {}
): PreviewServer {
  const defaultConfig: DevServerConfig = {
    port: 5173,
    root: '/',
    index: 'index.html',
    fallback: 'index.html',
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    }
  };

  const finalConfig: DevServerConfig = { ...defaultConfig, ...config };
  return new PreviewServer(fs, net, finalConfig);
}
