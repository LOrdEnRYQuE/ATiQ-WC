# ATiQ WebContainer Test Suite

## 🎯 Purpose

This test suite provides **brutal reality audits** that prove ATiQ WebContainer actually works, not just compiles.

## 🚀 Quick Start

### Interactive Demo
Open `tests/demo.html` in your browser to run individual audits or the complete suite with visual feedback.

### Automated Runner
```bash
# Run the full audit suite (non-interactive)
npx playwright test tests/runner.ts

# Or run with Node.js directly
node tests/runner.js
```

## 📋 Test Suites

### 1. WebFS Reality Audit (`webfs.test.ts`)
**Proves**: Filesystem actually works with atomic operations and persistence.

**Key Tests**:
- Atomic write operations under concurrency
- IndexedDB persistence across tab refreshes  
- 10,000 file bulk operations (<10s)
- File watching precision (1 event per change)
- Deep directory structures (10+ levels)
- Large file handling (5MB+ files)
- Concurrent operation safety

**Run**: `runWebFSRealityAudit()`

### 2. Package Manager Reality Audit (`package-manager.test.ts`)
**Proves**: Package installation works with caching and native dependency detection.

**Key Tests**:
- Postinstall script security (blocks dangerous scripts)
- Native dependency detection (sharp, sqlite3, node-gyp)
- Complex dependency resolution (circular, transitive)
- Package.json field support (exports, dual CJS/ESM)
- Cache performance (>2x speed on repeat installs)

**Run**: `runPackageManagerRealityAudit()`

### 3. Process Execution Reality Audit (`process-execution.test.ts`)
**Proves**: Processes actually execute with real workers and streams.

**Key Tests**:
- Real command execution (echo, cat, npm, node)
- Stream-based I/O (stdout/stderr)
- Process management (kill, concurrent execution)
- Command resolution (which)
- Memory and resource management

**Run**: `runProcessExecutionRealityAudit()`

### 4. Preview Server Reality Audit (`preview-server.test.ts`)
**Proves**: Service Worker-based server actually serves content.

**Key Tests**:
- Real HTTP server behavior (not virtual URLs)
- Content-Type handling for all file types
- HMR script injection and WebSocket communication
- File change detection and reload triggering
- Port conflict management
- Performance under load

**Run**: `runPreviewServerRealityAudit()`

## 📊 Output Artifacts

### `audit-summary.json`
Complete audit summary with:
- Browser information
- Test results and metrics
- Overall pass/fail status
- Timing information

### `receipts.ndjson`
Detailed operation log with:
- Every action (fs.write, proc.spawn, etc.)
- Timing, success/failure status
- Error details
- Machine-readable NDJSON format

## 🎮 Success Criteria

### Individual Suite Pass
All tests in suite pass with consistent performance.

### Full Suite Pass
All four suites pass:
- ✅ WebFS operations work
- ✅ Package manager handles installs correctly  
- ✅ Process execution works with streams
- ✅ Preview server serves files with HMR

### Production Readiness
When full suite passes:
```
🏆 ALL REALITY AUDITS PASSED
📜 ATiQ WebContainer is PRODUCTION READY
⚡ This is a working WebContainer, not a marketing demo
```

## 🔧 Usage in CI

```yaml
name: ATiQ Reality Audit
on: [push, pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run ATiQ Reality Audit
        run: npx playwright test tests/runner.ts
        
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: audit-results
          path: |
            audit-summary.json
            receipts.ndjson
```

## 🚨 Anti-Hallucination Rules

1. **No Mocking**: Tests must exercise real implementations
2. **Measurable Criteria**: Every requirement must have specific, measurable tests
3. **Reproducible**: Same inputs → same outputs every time
4. **No Manual Steps**: Fully automated, no "click here then run this"
5. **Edge Case Coverage**: Test with large files, deep paths, concurrent operations

---

**This is how ATiQ wins**: Not by claiming the wall isn't there, but by turning it into a door with brutal honesty about what actually works.
