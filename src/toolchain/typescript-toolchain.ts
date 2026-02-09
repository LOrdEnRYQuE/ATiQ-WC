import { BuildResult } from '../runtime/types';
import { FileSystemContract, ProcessContract } from '../runtime/contracts';

/**
 * TypeScript toolchain implementation
 */
export class TypeScriptToolchain {
  constructor(
    private fs: FileSystemContract,
    private proc: ProcessContract
  ) {}

  async typecheck(options: {
    tsconfigPath?: string;
    projectRoot?: string;
    noEmit?: boolean;
  } = {}): Promise<BuildResult> {
    const startTime = Date.now();
    
    try {
      const args = this.buildTscArgs(options);
      
      const result = await this.proc.spawn('tsc', args);
      
      if (result.exitCode !== 0) {
        const stderr = new TextDecoder().decode(result.stderr);
        const stdout = new TextDecoder().decode(result.stdout);
        
        return {
          success: false,
          outputs: {},
          warnings: this.parseWarnings(stdout),
          errors: this.parseErrors(stderr),
          duration: Date.now() - startTime,
          metadata: { command: 'tsc', args }
        };
      }
      
      return {
        success: true,
        outputs: {},
        warnings: [],
        errors: [],
        duration: Date.now() - startTime,
        metadata: { command: 'tsc', args }
      };
      
    } catch (error) {
      return {
        success: false,
        outputs: {},
        warnings: [],
        errors: [String(error)],
        duration: Date.now() - startTime,
        metadata: { command: 'tsc', error }
      };
    }
  }

  async compile(options: {
    entryPoints?: string[];
    outDir?: string;
    target?: string;
    module?: 'commonjs' | 'esnext' | 'es2020';
    declaration?: boolean;
    sourceMap?: boolean;
  } = {}): Promise<BuildResult> {
    const startTime = Date.now();
    
    try {
      const args = this.buildTscArgs({
        ...options,
        noEmit: false
      });
      
      const result = await this.proc.spawn('tsc', args);
      
      if (result.exitCode !== 0) {
        const stderr = new TextDecoder().decode(result.stderr);
        const stdout = new TextDecoder().decode(result.stdout);
        
        return {
          success: false,
          outputs: {},
          warnings: this.parseWarnings(stdout),
          errors: this.parseErrors(stderr),
          duration: Date.now() - startTime,
          metadata: { command: 'tsc', args }
        };
      }
      
      // Read output files
      const outputs: Record<string, Uint8Array> = {};
      
      if (options.outDir) {
        const files = await this.fs.readdir(options.outDir);
        for (const file of files) {
          const filePath = `${options.outDir}/${file}`;
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
        metadata: { command: 'tsc', args }
      };
      
    } catch (error) {
      return {
        success: false,
        outputs: {},
        warnings: [],
        errors: [String(error)],
        duration: Date.now() - startTime,
        metadata: { command: 'tsc', error }
      };
    }
  }

  async getDiagnostics(filePath: string): Promise<BuildResult> {
    const startTime = Date.now();
    
    try {
      // Create a temporary tsconfig for single file checking
      const tempConfig = {
        compilerOptions: {
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          target: 'ES2020',
          module: 'ESNext'
        },
        include: [filePath]
      };
      
      const configPath = '/tmp/tsconfig.json';
      await this.fs.writeFile(
        configPath,
        new TextEncoder().encode(JSON.stringify(tempConfig, null, 2))
      );
      
      const args = ['--noEmit', '--project', configPath];
      const result = await this.proc.spawn('tsc', args);
      
      if (result.exitCode !== 0) {
        const stderr = new TextDecoder().decode(result.stderr);
        const stdout = new TextDecoder().decode(result.stdout);
        
        return {
          success: false,
          outputs: {},
          warnings: this.parseWarnings(stdout),
          errors: this.parseErrors(stderr),
          duration: Date.now() - startTime,
          metadata: { command: 'tsc-diagnostics', args }
        };
      }
      
      return {
        success: true,
        outputs: {},
        warnings: [],
        errors: [],
        duration: Date.now() - startTime,
        metadata: { command: 'tsc-diagnostics', args }
      };
      
    } catch (error) {
      return {
        success: false,
        outputs: {},
        warnings: [],
        errors: [String(error)],
        duration: Date.now() - startTime,
        metadata: { command: 'tsc-diagnostics', error }
      };
    }
  }

  private buildTscArgs(options: any): string[] {
    const args: string[] = [];
    
    // Project configuration
    if (options.tsconfigPath) {
      args.push('--project', options.tsconfigPath);
    } else if (options.projectRoot) {
      args.push('--project', options.projectRoot);
    }
    
    // Entry points (if not using project config)
    if (options.entryPoints && !options.tsconfigPath && !options.projectRoot) {
      args.push(...options.entryPoints);
    }
    
    // Output directory
    if (options.outDir) {
      args.push('--outDir', options.outDir);
    }
    
    // Target
    if (options.target) {
      args.push('--target', options.target);
    }
    
    // Module system
    if (options.module) {
      args.push('--module', options.module);
    }
    
    // Declaration files
    if (options.declaration) {
      args.push('--declaration');
    }
    
    // Source maps
    if (options.sourceMap) {
      args.push('--sourceMap');
    }
    
    // No emit (for type checking only)
    if (options.noEmit) {
      args.push('--noEmit');
    }
    
    return args;
  }

  private parseErrors(output: string): string[] {
    const errors: string[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      // TypeScript error format: filename(line,column): error TS####: message
      const match = line.match(/error TS\d+:/);
      if (match) {
        errors.push(line.trim());
      }
    }
    
    return errors;
  }

  private parseWarnings(output: string): string[] {
    const warnings: string[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      // TypeScript warning format: filename(line,column): warning TS####: message
      const match = line.match(/warning TS\d+:/);
      if (match) {
        warnings.push(line.trim());
      }
    }
    
    return warnings;
  }
}
