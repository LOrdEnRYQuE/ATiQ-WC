import { FileSystemContract, ProcessContract } from '../runtime/contracts';
import { CacheEntry } from '../runtime/types';

/**
 * PNPM-like package manager implementation for browser
 * Fetches tarballs from npm registry and creates virtual node_modules
 */
export class PackageManager {
  private cache = new Map<string, CacheEntry>();
  private registryUrl = 'https://registry.npmjs.org';
  private tarballCache = new Map<string, Uint8Array>();

  constructor(
    private fs: FileSystemContract,
    private proc: ProcessContract
  ) {}

  async install(options: {
    cwd?: string;
    lockfile?: any;
    packages?: string[];
    dev?: boolean;
  } = {}): Promise<any> {
    const startTime = Date.now();
    const cwd = options.cwd || '/';
    
    try {
      // Read package.json if exists
      let packageJson: any = null;
      try {
        const packageContent = await this.fs.readFile(`${cwd}/package.json`);
        packageJson = JSON.parse(new TextDecoder().decode(packageContent));
      } catch {
        // No package.json found
      }

      if (!packageJson && !options.packages) {
        throw new Error('No package.json found and no packages specified');
      }

      // Determine packages to install
      const packages = options.packages || this.extractDependencies(packageJson, options.dev);
      
      if (packages.length === 0) {
        return {
          success: true,
          installed: [],
          duration: Date.now() - startTime
        };
      }

      // Resolve dependency graph
      const resolvedGraph = await this.resolveDependencies(packages);
      
      // Create virtual node_modules
      await this.createVirtualNodeModules(cwd, resolvedGraph);
      
      // Generate lockfile
      const lockfile = this.generateLockfile(resolvedGraph);
      await this.fs.writeFile(
        `${cwd}/package-lock.json`,
        new TextEncoder().encode(JSON.stringify(lockfile, null, 2))
      );

      return {
        success: true,
        installed: Object.keys(resolvedGraph),
        duration: Date.now() - startTime,
        metadata: {
          packages: packages.length,
          resolved: Object.keys(resolvedGraph).length,
          fromCache: this.getCacheHitCount(resolvedGraph)
        }
      };

    } catch (error) {
      return {
        success: false,
        installed: [],
        duration: Date.now() - startTime,
        error: String(error)
      };
    }
  }

  private extractDependencies(packageJson: any, dev?: boolean): string[] {
    if (!packageJson) return [];

    const deps: string[] = [];
    
    // Production dependencies
    if (packageJson.dependencies) {
      deps.push(...Object.keys(packageJson.dependencies));
    }

    // Development dependencies
    if (dev && packageJson.devDependencies) {
      deps.push(...Object.keys(packageJson.devDependencies));
    }

    return deps;
  }

  private async resolveDependencies(packages: string[]): Promise<Map<string, any>> {
    const resolved = new Map<string, any>();
    const queue = [...packages];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const pkg = queue.shift()!;
      
      if (visited.has(pkg)) continue;
      visited.add(pkg);

      // Check cache first
      const cached = this.cache.get(pkg);
      if (cached && this.isCacheValid(cached)) {
        resolved.set(pkg, cached.data);
        continue;
      }

      try {
        // Fetch package metadata from npm registry
        const metadata = await this.fetchPackageMetadata(pkg);
        const version = metadata['dist-tags']?.latest || 'latest';
        
        // Get specific version info
        const versionInfo = metadata.versions?.[version];
        if (!versionInfo) {
          throw new Error(`Version ${version} not found for package ${pkg}`);
        }

        // Resolve dependencies of this package
        const packageDeps = versionInfo.dependencies || {};
        const depNames = Object.keys(packageDeps);
        
        // Add dependencies to queue
        queue.push(...depNames);

        // Cache the resolved package
        const packageData = {
          name: pkg,
          version,
          tarball: versionInfo.dist?.tarball,
          dependencies: packageDeps,
          resolved: Date.now()
        };

        resolved.set(pkg, packageData);
        this.cachePackage(pkg, packageData);

      } catch (error) {
        console.warn(`Failed to resolve package ${pkg}:`, error);
        // Continue with other packages
      }
    }

    return resolved;
  }

  private async fetchPackageMetadata(packageName: string): Promise<any> {
    const cacheKey = `metadata:${packageName}`;
    
    // Check metadata cache
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (this.isCacheValid(cached)) {
        return JSON.parse(new TextDecoder().decode(cached.data));
      }
    }

    // Fetch from registry
    const url = `${this.registryUrl}/${packageName}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch package metadata: ${response.statusText}`);
    }

    const metadata = await response.json();
    
    // Cache metadata
    this.cachePackage(cacheKey, {
      data: new TextEncoder().encode(JSON.stringify(metadata)),
      timestamp: Date.now(),
      expires: Date.now() + (5 * 60 * 1000) // 5 minutes
    });

    return metadata;
  }

  private async createVirtualNodeModules(cwd: string, resolvedGraph: Map<string, any>): Promise<void> {
    const nodeModulesPath = `${cwd}/node_modules`;
    
    // Create node_modules directory
    await this.fs.mkdir(nodeModulesPath, { recursive: true });

    // Create virtual package directories
    for (const [pkgName, packageData] of resolvedGraph) {
      const packagePath = `${nodeModulesPath}/${pkgName}`;
      
      // Create package directory
      await this.fs.mkdir(packagePath, { recursive: true });
      
      // Create package.json
      const packageJsonContent = {
        name: packageData.name,
        version: packageData.version,
        main: packageData.main || 'index.js',
        exports: packageData.exports || {},
        dependencies: packageData.dependencies || {}
      };

      await this.fs.writeFile(
        `${packagePath}/package.json`,
        new TextEncoder().encode(JSON.stringify(packageJsonContent, null, 2))
      );

      // Create index.js (entry point)
      const indexContent = this.generateIndexJS(packageData);
      await this.fs.writeFile(
        `${packagePath}/index.js`,
        new TextEncoder().encode(indexContent)
      );
    }
  }

  private generateIndexJS(packageData: any): string {
    const deps = Object.entries(packageData.dependencies || {})
      .map(([name, version]) => `  const ${this.mangleName(name)} = require('${name}');`)
      .join('\n');

    const exports = Object.entries(packageData.dependencies || {})
      .map(([name]) => `  ${this.mangleName(name)}`)
      .join(', ');

    return `
// ATiQ WebContainer Virtual Package: ${packageData.name}@${packageData.version}
// Generated automatically - do not edit

${deps}

module.exports = {
${exports}
};

// Default export if main is not specified
if (typeof module !== 'undefined' && module.exports) {
  module.exports.default = module.exports;
}
    `.trim();
  }

  private mangleName(name: string): string {
    // Replace invalid characters with underscores
    return name.replace(/[^a-zA-Z0-9_$]/g, '_');
  }

  private generateLockfile(resolvedGraph: Map<string, any>): any {
    const lockfile: any = {
      name: 'atiq-generated-lock',
      version: '1.0.0',
      lockfileVersion: 1,
      packages: {},
      dependencies: {}
    };

    for (const [pkgName, packageData] of resolvedGraph) {
      lockfile.packages[`node_modules/${pkgName}`] = {
        version: packageData.version,
        resolved: packageData.tarball,
        integrity: packageData.integrity || 'sha512-unknown',
        dependencies: packageData.dependencies || {}
      };

      lockfile.dependencies[pkgName] = packageData.version;
    }

    return lockfile;
  }

  private cachePackage(key: string, data: any): void {
    this.cache.set(key, {
      key,
      data: data.data || data,
      timestamp: Date.now(),
      expires: data.expires
    });
  }

  private isCacheValid(entry: CacheEntry): boolean {
    if (!entry.expires) return true;
    return Date.now() < entry.expires;
  }

  private getCacheHitCount(resolvedGraph: Map<string, any>): number {
    let count = 0;
    for (const pkgName of resolvedGraph.keys()) {
      if (this.cache.has(pkgName)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Clear package cache
   */
  clearCache(): void {
    this.cache.clear();
    this.tarballCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    entries: number;
    size: number;
    hitRate: number;
  } {
    const entries = this.cache.size;
    let size = 0;
    let validEntries = 0;

    for (const entry of this.cache.values()) {
      size += entry.data.length || 0;
      if (this.isCacheValid(entry)) {
        validEntries++;
      }
    }

    return {
      entries,
      size,
      hitRate: entries > 0 ? validEntries / entries : 0
    };
  }
}
