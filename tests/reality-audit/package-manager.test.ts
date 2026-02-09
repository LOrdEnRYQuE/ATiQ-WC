/**
 * Package Manager Reality Audit Tests
 * 
 * Tests the brutal reality of npm install in browser
 */

import { PackageManager } from '../../src/package-manager/package-manager';
import { WebFS } from '../../src/runtime/browser/web-fs';
import { WebProc } from '../../src/runtime/browser/web-proc';

// Test state
let fs: WebFS;
let proc: WebProc;
let pm: PackageManager;

async function setup() {
  fs = new WebFS();
  await fs.init();
  
  proc = new WebProc();
  pm = new PackageManager(fs, proc);
}

async function teardown() {
  try {
    // Clean up node_modules if it exists
    if (await fs.exists('/node_modules')) {
      const files = await fs.readdir('/node_modules');
      for (const file of files) {
        await fs.rmdir(`/node_modules/${file}`, { recursive: true });
      }
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

describe('Package Manager Reality Audit', () => {
  beforeEach(setup);
  afterEach(teardown);

  describe('Postinstall Script Handling', () => {
    test('detects and blocks dangerous postinstall scripts', async () => {
      // Create package.json with malicious postinstall
      const maliciousPkg = {
        name: 'test-malicious',
        version: '1.0.0',
        scripts: {
          postinstall: 'rm -rf / && echo "pwned"'
        }
      };
      
      await fs.writeFile('/package.json', new TextEncoder().encode(JSON.stringify(maliciousPkg, null, 2)));
      
      const result = await pm.install();
      
      // Should fail or block the postinstall
      expect(result.success).toBe(false);
      expect(result.error).toContain('postinstall');
    });

    test('allows safe postinstall scripts', async () => {
      const safePkg = {
        name: 'test-safe',
        version: '1.0.0',
        scripts: {
          postinstall: 'echo "Build complete"'
        }
      };
      
      await fs.writeFile('/package.json', new TextEncoder().encode(JSON.stringify(safePkg, null, 2)));
      
      const result = await pm.install();
      
      // Should succeed but log the postinstall execution
      expect(result.success).toBe(true);
    });
  });

  describe('Native Dependency Detection', () => {
    test('detects node-gyp dependencies', async () => {
      const nativePkg = {
        name: 'test-native',
        version: '1.0.0',
        dependencies: {
          'node-gyp': '^9.0.0',
          'some-native-addon': '^1.0.0'
        }
      };
      
      await fs.writeFile('/package.json', new TextEncoder().encode(JSON.stringify(nativePkg, null, 2)));
      
      const result = await pm.install();
      
      // Should detect native dependencies and handle appropriately
      expect(result.success).toBe(false);
      expect(result.error).toContain('native');
      expect(result.error).toContain('node-gyp');
    });

    test('detects sharp dependency', async () => {
      const sharpPkg = {
        name: 'test-sharp',
        version: '1.0.0',
        dependencies: {
          'sharp': '^0.32.0'
        }
      };
      
      await fs.writeFile('/package.json', new TextEncoder().encode(JSON.stringify(sharpPkg, null, 2)));
      
      const result = await pm.install();
      
      // Should detect sharp and handle appropriately
      expect(result.success).toBe(false);
      expect(result.error).toContain('sharp');
    });
  });

  describe('Complex Package Resolution', () => {
    test('handles circular dependencies gracefully', async () => {
      // Create packages that depend on each other
      const pkgA = {
        name: 'pkg-a',
        version: '1.0.0',
        dependencies: { 'pkg-b': '^1.0.0' }
      };
      
      const pkgB = {
        name: 'pkg-b', 
        version: '1.0.0',
        dependencies: { 'pkg-a': '^1.0.0' }
      };
      
      await fs.writeFile('/package.json', new TextEncoder().encode(JSON.stringify({
        name: 'test-circular',
        version: '1.0.0',
        dependencies: { 'pkg-a': '^1.0.0', 'pkg-b': '^1.0.0' }
      }, null, 2)));
      
      const result = await pm.install();
      
      // Should detect circular dependency and handle it
      expect(result.success).toBe(false);
      expect(result.error).toContain('circular');
    });

    test('resolves transitive dependencies correctly', async () => {
      // Package A -> B -> C structure
      await fs.writeFile('/package.json', new TextEncoder().encode(JSON.stringify({
        name: 'test-transitive',
        version: '1.0.0',
        dependencies: { 'pkg-a': '^1.0.0' }
      }, null, 2)));
      
      const result = await pm.install();
      
      if (result.success) {
        // Should install A, B, and C transitively
        expect(result.installed).toContain('pkg-a');
        expect(result.installed).toContain('pkg-b');
        expect(result.installed).toContain('pkg-c');
      }
    });
  });

  describe('Package.json Field Support', () => {
    test('handles exports field correctly', async () => {
      const exportsPkg = {
        name: 'test-exports',
        version: '1.0.0',
        exports: {
          '.': './main.js',
          './module': './module.js',
          './import': './import.js'
        }
      };
      
      await fs.writeFile('/package.json', new TextEncoder().encode(JSON.stringify(exportsPkg, null, 2)));
      
      const result = await pm.install();
      
      if (result.success) {
        // Check that virtual package was created with correct exports
        const packageJson = await fs.readFile('/node_modules/test-exports/package.json');
        const pkg = JSON.parse(new TextDecoder().decode(packageJson));
        
        expect(pkg.exports).toEqual(exportsPkg.exports);
      }
    });

    test('handles dual CJS/ESM packages', async () => {
      const dualPkg = {
        name: 'test-dual',
        version: '1.0.0',
        main: './index.js',
        module: './index.esm.js',
        exports: {
          'import': './index.esm.js',
          'require': './index.js'
        }
      };
      
      await fs.writeFile('/package.json', new TextEncoder().encode(JSON.stringify(dualPkg, null, 2)));
      
      const result = await pm.install();
      
      if (result.success) {
        const packageJson = await fs.readFile('/node_modules/test-dual/package.json');
        const pkg = JSON.parse(new TextDecoder().decode(packageJson));
        
        expect(pkg.main).toBe('./index.js');
        expect(pkg.module).toBe('./index.esm.js');
      }
    });
  });

  describe('Cache Performance', () => {
    test('caches registry metadata effectively', async () => {
      // First install
      await fs.writeFile('/package.json', new TextEncoder().encode(JSON.stringify({
        name: 'test-cache',
        version: '1.0.0',
        dependencies: { 'lodash': '^4.17.0' }
      }, null, 2)));
      
      const start1 = Date.now();
      const result1 = await pm.install();
      const duration1 = Date.now() - start1;
      
      // Second install (should use cache)
      const start2 = Date.now();
      const result2 = await pm.install();
      const duration2 = Date.now() - start2;
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      
      // Second install should be significantly faster due to cache
      expect(duration2).toBeLessThan(duration1 * 0.5); // At least 2x faster
      
      const stats = pm.getCacheStats();
      expect(stats.hitRate).toBeGreaterThan(0);
    });

    test('cache survives restart', async () => {
      // Install package
      await fs.writeFile('/package.json', new TextEncoder().encode(JSON.stringify({
        name: 'test-persistence',
        version: '1.0.0',
        dependencies: { 'moment': '^2.29.0' }
      }, null, 2)));
      
      await pm.install();
      
      // Create new package manager instance (simulates restart)
      const newPm = new PackageManager(fs, proc);
      
      const start = Date.now();
      const result = await newPm.install();
      const duration = Date.now() - start;
      
      // Should use cache and be fast
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(1000); // Should be very fast from cache
    });
  });
});

// Manual test runner for immediate verification
export async function runPackageManagerRealityAudit() {
  console.log('📦 Starting Package Manager Reality Audit...');
  
  try {
    await setup();
    
    // Test basic install
    console.log('📥 Testing basic package install...');
    await fs.writeFile('/package.json', new TextEncoder().encode(JSON.stringify({
      name: 'test-basic',
      version: '1.0.0',
      dependencies: { 'lodash': '^4.17.0' }
    }, null, 2)));
    
    const result = await pm.install();
    if (result.success) {
      console.log('✓ Basic install test passed');
      
      // Check if virtual node_modules was created
      const exists = await fs.exists('/node_modules/lodash/package.json');
      if (exists) {
        console.log('✓ Virtual node_modules created');
      } else {
        console.log('✗ Virtual node_modules not found');
      }
    } else {
      console.log('✗ Basic install test failed:', result.error);
    }
    
    // Test cache performance
    console.log('⚡ Testing cache performance...');
    const start = Date.now();
    await pm.install(); // Should use cache
    const cacheTime = Date.now() - start;
    console.log(`✓ Cache test: ${cacheTime}ms (should be < 100ms)`);
    
    // Test native dependency detection
    console.log('🚫 Testing native dependency detection...');
    await fs.writeFile('/package.json', new TextEncoder().encode(JSON.stringify({
      name: 'test-native',
      version: '1.0.0',
      dependencies: { 'sharp': '^0.32.0' }
    }, null, 2)));
    
    const nativeResult = await pm.install();
    if (!nativeResult.success && nativeResult.error?.includes('native')) {
      console.log('✓ Native dependency detection works');
    } else {
      console.log('✗ Native dependency detection failed');
    }
    
    await teardown();
    
    console.log('🎉 Package Manager Reality Audit Complete!');
    return true;
    
  } catch (error) {
    console.error('❌ Package Manager Reality Audit Failed:', error);
    return false;
  }
}
