/**
 * ATiQ WebContainer Toolchain Module
 * Exports all toolchain implementations
 */

export { EsbuildToolchain } from './esbuild-toolchain';
export { TypeScriptToolchain } from './typescript-toolchain';

import { EsbuildToolchain } from './esbuild-toolchain';
import { TypeScriptToolchain } from './typescript-toolchain';
import { FileSystemContract, ProcessContract } from '../runtime/contracts';

/**
 * Unified toolchain interface
 */
export class Toolchain {
  public readonly esbuild: EsbuildToolchain;
  public readonly typescript: TypeScriptToolchain;

  constructor(
    fs: FileSystemContract,
    proc: ProcessContract
  ) {
    this.esbuild = new EsbuildToolchain(fs, proc);
    this.typescript = new TypeScriptToolchain(fs, proc);
  }

  /**
   * Quick build for development
   */
  async devBuild(entryPoint: string, options: {
    outDir?: string;
    minify?: boolean;
    sourcemap?: boolean;
  } = {}): Promise<any> {
    // Type check first
    const typecheck = await this.typescript.typecheck();
    if (!typecheck.success) {
      return typecheck;
    }

    // Then bundle with esbuild
    return await this.esbuild.bundle([entryPoint], {
      outdir: options.outDir || 'dist',
      format: 'esm',
      target: 'es2020',
      minify: options.minify || false,
      sourcemap: options.sourcemap || true,
      define: {
        'process.env.NODE_ENV': '"development"'
      }
    });
  }

  /**
   * Production build
   */
  async prodBuild(entryPoint: string, options: {
    outDir?: string;
    minify?: boolean;
    sourcemap?: boolean;
  } = {}): Promise<any> {
    // Type check first
    const typecheck = await this.typescript.typecheck();
    if (!typecheck.success) {
      return typecheck;
    }

    // Then bundle with esbuild
    return await this.esbuild.bundle([entryPoint], {
      outdir: options.outDir || 'dist',
      format: 'esm',
      target: 'es2020',
      minify: options.minify !== false, // Default to true for production
      sourcemap: options.sourcemap || false,
      define: {
        'process.env.NODE_ENV': '"production"'
      }
    });
  }

  /**
   * Transform a single file
   */
  async transformFile(filePath: string, options: {
    loader?: 'js' | 'ts' | 'jsx' | 'tsx';
    target?: string;
  } = {}): Promise<any> {
    // Read the file
    const content = await this.esbuild['fs'].readFile(filePath);
    const code = new TextDecoder().decode(content);
    
    // Determine loader from file extension if not provided
    if (!options.loader) {
      if (filePath.endsWith('.ts')) options.loader = 'ts';
      else if (filePath.endsWith('.tsx')) options.loader = 'tsx';
      else if (filePath.endsWith('.jsx')) options.loader = 'jsx';
      else options.loader = 'js';
    }

    return await this.esbuild.transform(code, options);
  }
}
