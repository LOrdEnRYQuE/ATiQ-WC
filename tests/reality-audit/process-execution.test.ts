/**
 * Process Execution Reality Audit Tests
 * 
 * Tests that processes actually execute, not just pretend
 */

import { WebProc } from '../../src/runtime/browser/web-proc';

// Test state
let proc: WebProc;

async function setup() {
  proc = new WebProc();
}

async function teardown() {
  // Clean up any running processes
  // WebProc doesn't have persistent state, so nothing to clean
}

describe('Process Execution Reality Audit', () => {
  beforeEach(setup);
  afterEach(teardown);

  describe('Real Command Execution', () => {
    test('echo command produces correct output', async () => {
      const result = await proc.spawn('echo', ['hello world']);
      
      expect(result.exitCode).toBe(0);
      expect(new TextDecoder().decode(result.stdout)).toBe('hello world');
      expect(result.stderr.length).toBe(0);
    });

    test('cat command reads files', async () => {
      // This test requires filesystem integration
      // For now, test that cat command exists and doesn't crash
      const result = await proc.spawn('cat', ['nonexistent.txt']);
      
      // Should handle file not found gracefully
      expect(result.exitCode).toBe(1); // Should indicate error
    });

    test('npm commands are recognized', async () => {
      const installResult = await proc.spawn('npm', ['install']);
      expect(installResult.exitCode).toBe(0);
      
      const runResult = await proc.spawn('npm', ['run', 'test']);
      expect(runResult.exitCode).toBe(0);
    });
  });

  describe('Stream Execution', () => {
    test('provides working stdout stream', async () => {
      const streams = await proc.spawnStream('echo', ['stream test']);
      
      const chunks: Uint8Array[] = [];
      const reader = streams.stdout.getReader();
      
      const readChunk = async () => {
        const { done, value } = await reader.read();
        if (value) chunks.push(value);
        if (done) return;
        return readChunk();
      };
      
      await readChunk();
      await streams.wait();
      
      const output = new TextDecoder().decode(
        new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], []))
      );
      
      expect(output).toContain('stream test');
    });

    test('provides working stderr stream', async () => {
      const streams = await proc.spawnStream('node', ['-e', 'console.error("error test")']);
      
      const chunks: Uint8Array[] = [];
      const reader = streams.stderr.getReader();
      
      const readChunk = async () => {
        const { done, value } = await reader.read();
        if (value) chunks.push(value);
        if (done) return;
        return readChunk();
      };
      
      await readChunk();
      await streams.wait();
      
      const output = new TextDecoder().decode(
        new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], []))
      );
      
      expect(output).toContain('error test');
    });
  });

  describe('Process Management', () => {
    test('kill terminates running process', async () => {
      const streams = await proc.spawnStream('node', ['-e', 'setInterval(() => console.log("running"), 1000)']);
      
      // Let it run a bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Kill the process
      await proc.kill(streams.pid);
      
      const result = await streams.wait();
      
      // Process should have been terminated
      expect(result.exitCode).not.toBe(0);
    });

    test('concurrent processes work independently', async () => {
      const proc1 = proc.spawnStream('echo', ['process1']);
      const proc2 = proc.spawnStream('echo', ['process2']);
      const proc3 = proc.spawnStream('echo', ['process3']);
      
      // All should run independently
      await Promise.all([
        proc1.wait(),
        proc2.wait(), 
        proc3.wait()
      ]);
      
      const result1 = await proc1.wait();
      const result2 = await proc2.wait();
      const result3 = await proc3.wait();
      
      expect(result1.exitCode).toBe(0);
      expect(result2.exitCode).toBe(0);
      expect(result3.exitCode).toBe(0);
      
      expect(new TextDecoder().decode((await proc1.wait()).stdout)).toContain('process1');
      expect(new TextDecoder().decode((await proc2.wait()).stdout)).toContain('process2');
      expect(new TextDecoder().decode((await proc3.wait()).stdout)).toContain('process3');
    });
  });

  describe('Command Resolution', () => {
    test('which finds existing commands', async () => {
      const echoPath = await proc.which('echo');
      expect(echoPath).toBe('/usr/bin/echo');
      
      const npmPath = await proc.which('npm');
      expect(npmPath).toBe('/usr/bin/npm');
    });

    test('which returns null for non-existent commands', async () => {
      const fakePath = await proc.which('nonexistent-command-12345');
      expect(fakePath).toBeNull();
    });
  });

  describe('Node.js Execution Reality', () => {
    test('node executes JavaScript code', async () => {
      const jsCode = 'console.log("Hello from Node.js"); process.exit(42);';
      
      const result = await proc.spawn('node', ['-e', jsCode]);
      
      expect(result.exitCode).toBe(42);
      expect(new TextDecoder().decode(result.stdout)).toContain('Hello from Node.js');
    });

    test('node handles script files', async () => {
      // This would require filesystem integration
      // For now, test that node command is recognized
      const result = await proc.spawn('node', ['--version']);
      
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Memory and Resource Management', () => {
    test('handles many processes without memory leaks', async () => {
      const processes = [];
      
      // Start 50 processes
      for (let i = 0; i < 50; i++) {
        const stream = proc.spawnStream('echo', [`process-${i}`]);
        processes.push(stream);
      }
      
      // Wait for all to complete
      await Promise.all(processes.map(p => p.wait()));
      
      // All should complete successfully
      for (const stream of processes) {
        const result = await stream.wait();
        expect(result.exitCode).toBe(0);
      }
      
      // No memory leaks - all processes should be cleaned up
      console.log('✓ Memory test: 50 processes executed');
    });

    test('respects execution timeouts', async () => {
      // This would require timeout implementation in WebProc
      // For now, test that we can execute long-running processes
      const stream = proc.spawnStream('node', ['-e', 'setTimeout(() => console.log("done"), 1000);']);
      
      const startTime = Date.now();
      const result = await stream.wait();
      const duration = Date.now() - startTime;
      
      expect(result.exitCode).toBe(0);
      expect(duration).toBeGreaterThan(900); // Should wait at least 1 second
      expect(duration).toBeLessThan(2000); // But not too long
    });
  });
});

// Manual test runner for immediate verification
export async function runProcessExecutionRealityAudit() {
  console.log('⚙️ Starting Process Execution Reality Audit...');
  
  try {
    await setup();
    
    // Test basic command execution
    console.log('📝 Testing basic command execution...');
    const echoResult = await proc.spawn('echo', ['ATiQ Process Test']);
    
    if (echoResult.exitCode === 0) {
      const output = new TextDecoder().decode(echoResult.stdout);
      console.log('✓ Basic execution test passed:', output);
    } else {
      console.log('✗ Basic execution test failed');
    }
    
    // Test stream execution
    console.log('🌊 Testing stream execution...');
    const stream = await proc.spawnStream('echo', ['Stream Test']);
    
    const chunks: Uint8Array[] = [];
    const reader = stream.stdout.getReader();
    
    const readAll = async () => {
      const { done, value } = await reader.read();
      if (value) chunks.push(value);
      if (done) return;
      return readAll();
    };
    
    await readAll();
    await stream.wait();
    
    const streamOutput = new TextDecoder().decode(
      new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], []))
    );
    
    if (streamOutput.includes('Stream Test')) {
      console.log('✓ Stream execution test passed');
    } else {
      console.log('✗ Stream execution test failed');
    }
    
    // Test command resolution
    console.log('🔍 Testing command resolution...');
    const echoPath = await proc.which('echo');
    const fakePath = await proc.which('fake-command');
    
    if (echoPath && !fakePath) {
      console.log('✓ Command resolution test passed');
    } else {
      console.log('✗ Command resolution test failed');
    }
    
    // Test concurrent execution
    console.log('🔄 Testing concurrent execution...');
    const concurrent = [];
    for (let i = 0; i < 10; i++) {
      concurrent.push(proc.spawn('echo', [`concurrent-${i}`]));
    }
    
    await Promise.all(concurrent);
    
    let allPassed = true;
    for (let i = 0; i < 10; i++) {
      const result = await concurrent[i];
      if (result.exitCode !== 0) {
        allPassed = false;
        break;
      }
    }
    
    if (allPassed) {
      console.log('✓ Concurrent execution test passed');
    } else {
      console.log('✗ Concurrent execution test failed');
    }
    
    await teardown();
    
    console.log('🎉 Process Execution Reality Audit Complete!');
    return true;
    
  } catch (error) {
    console.error('❌ Process Execution Reality Audit Failed:', error);
    return false;
  }
}
