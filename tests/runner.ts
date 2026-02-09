/**
 * ATiQ WebContainer Test Runner
 * 
 * Non-interactive runner for CI and automated verification
 */

import { runWebFSRealityAudit } from './reality-audit/webfs.test.js';
import { runPackageManagerRealityAudit } from './reality-audit/package-manager.test.js';
import { runProcessExecutionRealityAudit } from './reality-audit/process-execution.test.js';
import { runPreviewServerRealityAudit } from './reality-audit/preview-server.test.js';

interface TestResult {
  suite: string;
  status: 'pass' | 'fail';
  duration: number;
  metrics?: Record<string, unknown>;
  error?: string;
}

interface AuditSummary {
  version: string;
  browser: string;
  startedAt: string;
  endedAt: string;
  results: TestResult[];
  status: 'pass' | 'fail';
}

class ATiQTestRunner {
  private startTime: number = 0;
  private results: TestResult[] = [];

  constructor() {
    this.startTime = Date.now();
  }

  async runFullAudit(): Promise<AuditSummary> {
    console.log('🚀 Starting ATiQ WebContainer Automated Reality Audit');
    console.log(`Browser: ${navigator.userAgent}`);
    console.log(`Started: ${new Date().toISOString()}`);
    
    const summary: AuditSummary = {
      version: '1.0.0',
      browser: this.getBrowserInfo(),
      startedAt: new Date().toISOString(),
      endedAt: '',
      results: [],
      status: 'pass' // Default to pass, will be overridden on failure
    };

    try {
      // Run all reality audits
      console.log('\n📁 Running WebFS Audit...');
      const webfsResult = await this.runTest('webfs', runWebFSRealityAudit);
      summary.results.push(webfsResult);

      console.log('\n📦 Running Package Manager Audit...');
      const pmResult = await this.runTest('package-manager', runPackageManagerRealityAudit);
      summary.results.push(pmResult);

      console.log('\n⚙️ Running Process Execution Audit...');
      const procResult = await this.runTest('process-execution', runProcessExecutionRealityAudit);
      summary.results.push(procResult);

      console.log('\n🌐 Running Preview Server Audit...');
      const serverResult = await this.runTest('preview-server', runPreviewServerRealityAudit);
      summary.results.push(serverResult);

      // Calculate final status
      const failures = summary.results.filter(r => r.status === 'fail').length;
      summary.status = failures === 0 ? 'pass' : 'fail';
      summary.endedAt = new Date().toISOString();

      // Generate artifacts
      await this.saveArtifacts(summary);

      // Log summary
      this.logSummary(summary);

      return summary;

    } catch (error) {
      summary.status = 'fail';
      summary.endedAt = new Date().toISOString();
      
      const errorResult: TestResult = {
        suite: 'runner',
        status: 'fail',
        duration: Date.now() - this.startTime,
        error: error.message
      };
      summary.results.push(errorResult);
      
      await this.saveArtifacts(summary);
      this.logSummary(summary);
      
      return summary;
    }
  }

  private async runTest(suiteName: string, testRunner: () => Promise<boolean>): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const passed = await testRunner();
      const duration = Date.now() - startTime;
      
      console.log(`✅ ${suiteName}: ${passed ? 'PASSED' : 'FAILED'} (${duration}ms)`);
      
      return {
        suite: suiteName,
        status: passed ? 'pass' : 'fail',
        duration,
        metrics: { duration }
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`❌ ${suiteName}: FAILED (${duration}ms) - ${error.message}`);
      
      return {
        suite: suiteName,
        status: 'fail',
        duration,
        error: error.message,
        metrics: { duration }
      };
    }
  }

  private getBrowserInfo(): string {
    const ua = navigator.userAgent;
    
    // Extract browser name and version
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    
    return 'Unknown';
  }

  private async saveArtifacts(summary: AuditSummary): Promise<void> {
    // Save audit summary as JSON
    const summaryJson = JSON.stringify(summary, null, 2);
    this.downloadFile('audit-summary.json', summaryJson, 'application/json');
    
    // Save receipts as NDJSON (one JSON per line)
    const receiptsLines = summary.results.map(result => 
      JSON.stringify({
        timestamp: new Date().toISOString(),
        suite: result.suite,
        status: result.status,
        duration: result.duration,
        metrics: result.metrics,
        error: result.error
      })
    ).join('\n');
    
    this.downloadFile('receipts.ndjson', receiptsLines, 'application/x-ndjson');
  }

  private downloadFile(filename: string, content: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    
    a.click();
    
    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  private logSummary(summary: AuditSummary): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 ATiQ WebContainer Automated Audit Summary');
    console.log('=' .repeat(60));
    
    console.log(`Version: ${summary.version}`);
    console.log(`Browser: ${summary.browser}`);
    console.log(`Started: ${summary.startedAt}`);
    console.log(`Ended: ${summary.endedAt}`);
    console.log(`Status: ${summary.status.toUpperCase()}`);
    
    console.log('\n📋 Test Results:');
    summary.results.forEach(result => {
      const status = result.status === 'pass' ? '✅' : '❌';
      console.log(`  ${status} ${result.suite}: ${result.duration}ms`);
      if (result.metrics) {
        Object.entries(result.metrics).forEach(([key, value]) => {
          console.log(`     ${key}: ${value}`);
        });
      }
      if (result.error) {
        console.log(`     Error: ${result.error}`);
      }
    });
    
    const passedCount = summary.results.filter(r => r.status === 'pass').length;
    const totalCount = summary.results.length;
    const successRate = totalCount > 0 ? (passedCount / totalCount) * 100 : 0;
    
    console.log(`\n🏆 Overall: ${passedCount}/${totalCount} tests passed (${successRate.toFixed(1)}%)`);
    
    if (summary.status === 'pass') {
      console.log('🎉 ALL REALITY AUDITS PASSED');
      console.log('📜 ATiQ WebContainer is PRODUCTION READY');
      console.log('⚡ This is a working WebContainer, not a marketing demo');
    } else {
      console.log('⚠️ REALITY AUDITS FAILED');
      console.log('🔧 ATiQ WebContainer needs fixes before production');
    }
    
    console.log('\n📄 Artifacts: audit-summary.json, receipts.ndjson');
    console.log('=' .repeat(60));
  }

  // Auto-run when loaded
  if (typeof window !== 'undefined') {
    window.ATiQTestRunner = ATiQTestRunner;
    
    // Auto-run in headless environments
    if (!document.hidden) {
      console.log('🤖 Headless environment detected - running full audit...');
      const runner = new ATiQTestRunner();
      runner.runFullAudit().then(summary => {
        if (summary.status === 'pass') {
          console.log('✅ Audit completed successfully');
          // In Node.js environment, would exit with appropriate code
          if (typeof process !== 'undefined') {
            process.exit(summary.status === 'pass' ? 0 : 1);
          }
        } else {
          console.log('❌ Audit failed');
          if (typeof process !== 'undefined') {
            process.exit(1);
          }
        }
      });
    }
  }
}

// Export for use
export { ATiQTestRunner, TestResult, AuditSummary };
