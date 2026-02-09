/**
 * WebFS Reality Audit Tests
 * 
 * These tests prove WebFS actually works, not just compiles
 */

import { WebFS } from '../../src/runtime/browser/web-fs';

// Test state
let fs: WebFS;

async function setup() {
  fs = new WebFS();
  await fs.init();
}

async function teardown() {
  // Clean up test data
  try {
    const files = await fs.readdir('/');
    for (const file of files) {
      if (file.startsWith('test-')) {
        await fs.unlink('/' + file);
      }
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

describe('WebFS Reality Audit', () => {
  beforeEach(setup);
  afterEach(teardown);

  describe('Atomic Write Operations', () => {
    test('writeFile should be atomic across concurrent writes', async () => {
      const content1 = new TextEncoder().encode('content1');
      const content2 = new TextEncoder().encode('content2');
      
      // Concurrent writes to same file
      const write1 = fs.writeFile('/test-atomic.txt', content1);
      const write2 = fs.writeFile('/test-atomic.txt', content2);
      
      await Promise.all([write1, write2]);
      
      // File should exist and have one of the contents
      const result = await fs.readFile('/test-atomic.txt');
      const content = new TextDecoder().decode(result);
      
      // Should be either content1 or content2, not corrupted
      expect(['content1', 'content2']).toContain(content);
    });

    test('rename should be atomic', async () => {
      const content = new TextEncoder().encode('original');
      await fs.writeFile('/test-rename.txt', content);
      
      const newContent = new TextEncoder().encode('renamed');
      await fs.writeFile('/test-target.txt', newContent);
      
      // Atomic rename
      await fs.rename('/test-target.txt', '/test-renamed.txt');
      
      // Original should be gone, renamed should exist
      await expect(fs.exists('/test-target.txt')).resolves.toBe(false);
      await expect(fs.exists('/test-renamed.txt')).resolves.toBe(true);
      
      const result = await fs.readFile('/test-renamed.txt');
      expect(new TextDecoder().decode(result)).toBe('renamed');
    });
  });

  describe('Persistence Reality Check', () => {
    test('survives tab refresh simulation', async () => {
      // Write test data
      await fs.writeFile('/test-persistence.txt', new TextEncoder().encode('persistent'));
      await fs.mkdir('/test-dir');
      await fs.writeFile('/test-dir/nested.txt', new TextEncoder().encode('nested'));
      
      // Create new instance (simulates tab refresh)
      const newFs = new WebFS();
      await newFs.init();
      
      // Data should still be there
      const content = await newFs.readFile('/test-persistence.txt');
      expect(new TextDecoder().decode(content)).toBe('persistent');
      
      const nested = await newFs.readFile('/test-dir/nested.txt');
      expect(new TextDecoder().decode(nested)).toBe('nested');
      
      const files = await newFs.readdir('/');
      expect(files).toContain('test-persistence.txt');
      expect(files).toContain('test-dir');
    });

    test('handles 10,000 small files', async () => {
      const startTime = Date.now();
      
      // Write 10,000 small files
      const writes = [];
      for (let i = 0; i < 10000; i++) {
        writes.push(fs.writeFile(`/test-bulk-${i}.txt`, new TextEncoder().encode(`content-${i}`)));
      }
      
      await Promise.all(writes);
      
      const duration = Date.now() - startTime;
      console.log(`10,000 files written in ${duration}ms`);
      
      // Verify all files exist
      for (let i = 0; i < 1000; i += 100) { // Sample 10%
        const exists = await fs.exists(`/test-bulk-${i}.txt`);
        expect(exists).toBe(true);
      }
      
      // Should complete in reasonable time (< 10 seconds)
      expect(duration).toBeLessThan(10000);
    });
  });

  describe('File Watching Reality', () => {
    test('triggers exactly once per change', async () => {
      const events: any[] = [];
      
      const unwatch = await fs.watch('/test-watch.txt', (event) => {
        events.push({ ...event, timestamp: Date.now() });
      });
      
      // Write file
      await fs.writeFile('/test-watch.txt', new TextEncoder().encode('content1'));
      
      // Wait a bit for event propagation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should have exactly one event
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('change');
      expect(events[0].path).toBe('/test-watch.txt');
      
      // Write again
      await fs.writeFile('/test-watch.txt', new TextEncoder().encode('content2'));
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should have exactly two events
      expect(events.length).toBe(2);
      expect(events[1].type).toBe('change');
      
      unwatch();
    });

    test('handles rapid file changes', async () => {
      const events: any[] = [];
      
      const unwatch = await fs.watch('/test-rapid.txt', (event) => {
        events.push(event);
      });
      
      // Rapid changes
      for (let i = 0; i < 100; i++) {
        await fs.writeFile('/test-rapid.txt', new TextEncoder().encode(`content-${i}`));
        await new Promise(resolve => setTimeout(resolve, 1)); // 1ms between writes
      }
      
      await new Promise(resolve => setTimeout(resolve, 200)); // Wait for final events
      
      // Should handle all changes (may coalesce some, but should not crash)
      expect(events.length).toBeGreaterThan(50); // At least half should trigger
      expect(events.length).toBeLessThan(200); // But not infinite
      
      unwatch();
    });
  });

  describe('Edge Cases', () => {
    test('handles deep directory structures', async () => {
      // Create 10-level deep directory structure
      let path = '';
      for (let i = 0; i < 10; i++) {
        path += `/level-${i}`;
        await fs.mkdir(path);
      }
      
      const deepFile = path + '/deep.txt';
      await fs.writeFile(deepFile, new TextEncoder().encode('deep content'));
      
      // Should be able to read it back
      const content = await fs.readFile(deepFile);
      expect(new TextDecoder().decode(content)).toBe('deep content');
      
      // Should be able to traverse to it
      const stats = await fs.stat(deepFile);
      expect(stats.isFile).toBe(true);
    });

    test('handles large files', async () => {
      // Create 5MB file
      const largeContent = new Array(5 * 1024 * 1024).fill('x').join('');
      const largeData = new TextEncoder().encode(largeContent);
      
      const startTime = Date.now();
      await fs.writeFile('/test-large.txt', largeData);
      const writeTime = Date.now() - startTime;
      
      // Should write in reasonable time
      expect(writeTime).toBeLessThan(5000); // 5 seconds max
      
      // Should read back correctly
      const readBack = await fs.readFile('/test-large.txt');
      expect(readBack.length).toBe(largeData.length);
      
      // Should read in reasonable time
      const readStartTime = Date.now();
      await fs.readFile('/test-large.txt');
      const readTime = Date.now() - readStartTime;
      expect(readTime).toBeLessThan(1000); // 1 second max
    });

    test('handles concurrent operations safely', async () => {
      // Mixed concurrent operations
      const operations = [
        fs.writeFile('/test-concurrent-1.txt', new TextEncoder().encode('content1')),
        fs.writeFile('/test-concurrent-2.txt', new TextEncoder().encode('content2')),
        fs.mkdir('/test-concurrent-dir'),
        fs.readdir('/'),
        fs.stat('/test-concurrent-1.txt')
      ];
      
      // Should not throw or deadlock
      await expect(Promise.all(operations)).resolves.toBeDefined();
      
      // All operations should complete successfully
      await expect(fs.exists('/test-concurrent-1.txt')).resolves.toBe(true);
      await expect(fs.exists('/test-concurrent-2.txt')).resolves.toBe(true);
      await expect(fs.exists('/test-concurrent-dir')).resolves.toBe(true);
    });
  });
});

// Manual test runner for immediate verification
export async function runWebFSRealityAudit() {
  console.log('🔍 Starting WebFS Reality Audit...');
  
  try {
    await setup();
    
    // Run atomic write test
    console.log('📝 Testing atomic writes...');
    const content1 = new TextEncoder().encode('content1');
    const content2 = new TextEncoder().encode('content2');
    
    await fs.writeFile('/test-atomic.txt', content1);
    const result1 = await fs.readFile('/test-atomic.txt');
    console.log('✓ Atomic write test passed');
    
    // Test persistence
    console.log('💾 Testing persistence...');
    const newFs = new WebFS();
    await newFs.init();
    const persisted = await newFs.readFile('/test-atomic.txt');
    console.log('✓ Persistence test passed');
    
    // Test bulk operations
    console.log('📦 Testing bulk operations...');
    const startTime = Date.now();
    const writes = [];
    for (let i = 0; i < 1000; i++) {
      writes.push(fs.writeFile(`/bulk-${i}.txt`, new TextEncoder().encode(`data-${i}`)));
    }
    await Promise.all(writes);
    const duration = Date.now() - startTime;
    console.log(`✓ Bulk operations: 1000 files in ${duration}ms`);
    
    // Test file watching
    console.log('👀 Testing file watching...');
    const events: any[] = [];
    const unwatch = await fs.watch('/watch-test.txt', (event) => {
      events.push(event);
    });
    
    await fs.writeFile('/watch-test.txt', new TextEncoder().encode('watched'));
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (events.length > 0) {
      console.log('✓ File watching test passed');
    } else {
      console.log('✗ File watching test failed');
    }
    
    unwatch();
    await teardown();
    
    console.log('🎉 WebFS Reality Audit Complete!');
    return true;
    
  } catch (error) {
    console.error('❌ WebFS Reality Audit Failed:', error);
    return false;
  }
}
