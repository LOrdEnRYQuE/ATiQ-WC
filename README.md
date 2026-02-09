# ATiQ WebContainer

**Better than StackBlitz by being honest about what "better" means.**

ATiQ WebContainer is a browser-hosted runtime that provides a complete development environment with hybrid fallback capabilities. Unlike pure WebContainers, we don't pretend native dependencies don't exist—we handle them gracefully.

## 🎯 What Makes ATiQ Better

- **Hybrid by Design**: Fast in-browser execution when possible, seamless fallback for native deps
- **Deterministic Builds**: Lockfile + cache = reproducible environments
- **Graceful Degradation**: No mysterious failure loops, clear capability detection
- **Project Portability**: Everything is a standard workspace + lockfile
- **Truthful UX**: We show exactly what we can and cannot run

## 🏗️ Architecture

ATiQ WebContainer provides:

1. **Virtual Filesystem** - Read/write files like a real project folder
2. **Process Model** - Run commands with stdout/stderr streams
3. **Toolchain Runtime** - Node/JS + build tools (esbuild, TypeScript)
4. **Networking Model** - Localhost ports + fetch access + preview server
5. **Persistence & Caching** - Reload isn't a fresh apocalypse

## 🚀 Quick Start

```typescript
import { createRuntime } from '@atiq/webcontainer';

// Create a runtime for your project
const runtime = await createRuntime({
  files: {
    'package.json': new TextEncoder().encode(JSON.stringify({
      name: 'my-app',
      scripts: { dev: 'vite' }
    })),
    'index.html': new TextEncoder().encode('<h1>Hello ATiQ!</h1>')
  },
  hasNativeDeps: false
});

// Run a command
const result = await runtime.proc.spawn('npm', ['run', 'dev']);
console.log(new TextDecoder().decode(result.stdout));

// Read files
const packageJson = await runtime.fs.readFile('package.json');
console.log(JSON.parse(new TextDecoder().decode(packageJson)));
```

## 📦 Runtime Contracts

ATiQ's superpower is our well-defined contracts:

- **FileSystemContract**: `readFile`, `writeFile`, `readdir`, `stat`, etc.
- **ProcessContract**: `spawn`, `spawnStream`, `kill`, `which`
- **NetworkContract**: `fetch`, `listen`, `isPortAvailable`
- **SnapshotContract**: `create`, `restore`, `list`, `delete`
- **ReceiptContract**: `record`, `get`, `list`, `verify`

All implementations (browser, fallback, etc.) conform to these contracts.

## 🌐 Browser Runtime

The default runtime provides:

- **WebFS**: In-memory filesystem with IndexedDB persistence
- **WebProc**: Worker-based process execution with virtual commands
- **WebNet**: Service Worker-based local servers + fetch API
- **WebSnapshots**: IndexedDB-based state snapshots
- **WebReceipts**: Action logging and verification

## 🔄 Hybrid Fallback

When the browser can't handle something:

1. **Detection**: Automatically detect native dependencies or unsupported scripts
2. **Handoff**: One-click "Run in Runner" switches to VPS/local agent
3. **Unified API**: Same commands, same receipts, different backend

This is how we beat pure WebContainer tools: **we actually run more projects**.

## 🛠️ Supported Toolchain

### ✅ Browser-Native (Fast)
- esbuild-wasm for bundling
- TypeScript language service
- Vite-like dev server emulation
- React/Vue/Svelte apps without native deps

### 🔄 Hybrid Fallback (Complete)
- Node.js native modules (sharp, sqlite, node-gyp)
- Heavy builds (400MB+ node_modules)
- OS-level operations (signals, sockets, file watchers)

## 🔒 Security

In-browser execution is sandboxed by the browser, plus:

- Resource limits (worker kill, timeouts)
- Network allowlists (no crypto miners)
- Dependency scanning / policy gates

Fallback runners use real isolation (nsjail/gVisor/Firecracker in production).

## 📋 Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Development
npm run dev

### Test
```bash
npm test
```

### CI Integration
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

## 📄 License

MIT License - see LICENSE file for details.

## 🔗 Links

- [Documentation](https://docs.atiq.dev/webcontainer)
- [API Reference](https://docs.atiq.dev/webcontainer/api)
- [Examples](https://github.com/atiq/webcontainer-examples)
- [Issues](https://github.com/atiq/webcontainer/issues)

---

**ATiQ WebContainer**: Fast when it can be, real when it must be.
