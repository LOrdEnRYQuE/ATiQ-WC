import { BuildResult, ModuleResolution } from '../runtime/types';
import { FileSystemContract, ProcessContract } from '../runtime/contracts';

/**
 * esbuild-based toolchain implementation using esbuild-wasm
 */
export class EsbuildToolchain {
  constructor(
    private fs: FileSystemContract,
    private proc: ProcessContract
  ) {}

  async bundle(entryPoints: string[], options: {
    outdir?: string;
    outfile?: string;
    format?: 'esm' | 'cjs' | 'iife';
    target?: string;
    minify?: boolean;
    sourcemap?: boolean;
    external?: string[];
    define?: Record<string, string>;
  } = {}): Promise<BuildResult> {
    const startTime = Date.now();
    
    try {
      // Build esbuild command arguments
      const args = this.buildEsbuildArgs(entryPoints, options);
      
      // Run esbuild via the process contract
      const result = await this.proc.spawn('esbuild', args);
      
      if (result.exitCode !== 0) {
        const stderr = new TextDecoder().decode(result.stderr);
        return {
          success: false,
          outputs: {},
          warnings: [],
          errors: [stderr],
          duration: Date.now() - startTime,
          metadata: { command: 'esbuild', args }
        };
      }
      
      // Read output files
      const outputs: Record<string, Uint8Array> = {};
      
      if (options.outfile) {
        const content = await this.fs.readFile(options.outfile);
        outputs[options.outfile] = content;
      } else if (options.outdir) {
        // Read all files in output directory
        const files = await this.fs.readdir(options.outdir);
        for (const file of files) {
          const filePath = `${options.outdir}/${file}`;
          const content = await this.fs.readFile(filePath);
          outputs[filePath] = content;
        }
      }
      
      return {
        success: true,
        outputs,
        warnings: [],
        errors: [],
        duration: Date.now() - startTime,
        metadata: { command: 'esbuild', args }
      };
      
    } catch (error) {
      return {
        success: false,
        outputs: {},
        warnings: [],
        errors: [String(error)],
        duration: Date.now() - startTime,
        metadata: { command: 'esbuild', error }
      };
    }
  }

  async resolveModule(specifier: string, importer?: string): Promise<ModuleResolution> {
    // Simple module resolution for now
    // This would need to be enhanced for full Node.js compatibility
    
    if (specifier.startsWith('.')) {
      // Relative import
      const basePath = importer ? importer.split('/').slice(0, -1).join('/') : '';
      const resolved = this.resolvePath(basePath, specifier);
      return {
        resolved,
        type: 'file'
      };
    }
    
    if (specifier.startsWith('/')) {
      // Absolute import
      return {
        resolved: specifier,
        type: 'file'
      };
    }
    
    // Bare import - treat as package
    return {
      resolved: specifier,
      type: 'package',
      package: {
        name: specifier.split('/')[0] || 'unknown',
        version: 'latest'
      }
    };
  }

  async transform(code: string, options: {
    loader?: 'js' | 'ts' | 'jsx' | 'tsx';
    target?: string;
    minify?: boolean;
    define?: Record<string, string>;
  } = {}): Promise<BuildResult> {
    const startTime = Date.now();
    
    try {
      // Create temporary files for transformation
      const loader = options.loader || 'js';
      const inputFile = `/tmp/input.${loader}`;
      const outputFile = '/tmp/output.js';
      
      await this.fs.writeFile(inputFile, new TextEncoder().encode(code));
      
      const args = [
        inputFile,
        '--outfile=' + outputFile,
        '--bundle',
        '--format=esm'
      ];
      
      if (options.target) {
        args.push(`--target=${options.target}`);
      }
      
      if (options.minify) {
        args.push('--minify');
      }
      
      if (options.define) {
        Object.entries(options.define).forEach(([key, value]) => {
          args.push(`--define:${key}=${value}`);
        });
      }
      
      const result = await this.proc.spawn('esbuild', args);
      
      if (result.exitCode !== 0) {
        const stderr = new TextDecoder().decode(result.stderr);
        return {
          success: false,
          outputs: {},
          warnings: [],
          errors: [stderr],
          duration: Date.now() - startTime,
          metadata: { command: 'esbuild-transform', error: stderr }
        };
      }
      
      const output = await this.fs.readFile(outputFile);
      
      return {
        success: true,
        outputs: { 'output.js': output },
        warnings: [],
        errors: [],
        duration: Date.now() - startTime,
        metadata: { command: 'esbuild-transform' }
      };
      
    } catch (error) {
      return {
        success: false,
        outputs: {},
        warnings: [],
        errors: [String(error)],
        duration: Date.now() - startTime,
        metadata: { command: 'esbuild-transform', error }
      };
    }
  }

  private buildEsbuildArgs(entryPoints: string[], options: any): string[] {
    const args: string[] = [];
    
    // Add entry points
    args.push(...entryPoints);
    
    // Output options
    if (options.outfile) {
      args.push(`--outfile=${options.outfile}`);
    } else if (options.outdir) {
      args.push(`--outdir=${options.outdir}`);
    }
    
    // Format
    if (options.format) {
      args.push(`--format=${options.format}`);
    }
    
    // Target
    if (options.target) {
      args.push(`--target=${options.target}`);
    }
    
    // Minification
    if (options.minify) {
      args.push('--minify');
    }
    
    // Source maps
    if (options.sourcemap) {
      args.push('--sourcemap');
    }
    
    // External dependencies
    if (options.external) {
      options.external.forEach((ext: string) => {
        args.push(`--external:${ext}`);
      });
    }
    
    // Define constants
    if (options.define) {
      Object.entries(options.define).forEach(([key, value]) => {
        args.push(`--define:${key}=${value}`);
      });
    }
    
    // Bundle by default
    if (!args.includes('--bundle')) {
      args.push('--bundle');
    }
    
    return args;
  }

  private resolvePath(base: string, relative: string): string {
    const parts = relative.split('/');
    const baseParts = base ? base.split('/') : [];
    
    for (const part of parts) {
      if (part === '..') {
        baseParts.pop();
      } else if (part !== '.') {
        baseParts.push(part);
      }
    }
    
    return '/' + baseParts.join('/');
  }
}
