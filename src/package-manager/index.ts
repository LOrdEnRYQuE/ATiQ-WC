/**
 * ATiQ WebContainer Package Manager Module
 * Exports package management functionality
 */

export { PackageManager } from './package-manager';

import { PackageManager } from './package-manager';
import { FileSystemContract, ProcessContract } from '../runtime/contracts';

/**
 * Create a package manager instance
 */
export function createPackageManager(
  fs: FileSystemContract,
  proc: ProcessContract
): PackageManager {
  return new PackageManager(fs, proc);
}
